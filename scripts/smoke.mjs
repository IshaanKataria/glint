// Shell smoke test: launches Glint with GLINT_TEST=1 via Playwright's Electron driver,
// reads window state through the real preload API, checks the hotkey registrations, then quits.
// Run: npm run smoke   (builds first). Exit code 1 if a check fails.
import { _electron as electron } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dataDir = join(root, 'test-output', 'smoke-data');
mkdirSync(dataDir, { recursive: true });

const logs = [];
const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, GLINT_TEST: '1', GLINT_DATA_DIR: dataDir },
  timeout: 30000,
});
app.process().stdout?.on('data', (d) => logs.push(...String(d).trim().split('\n')));
app.process().stderr?.on('data', (d) => logs.push(...String(d).trim().split('\n').map((l) => `stderr: ${l}`)));

const checks = [];
// Playwright's waitForFunction treats a returned Promise as truthy, so poll async state from Node instead.
async function waitFor(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

try {
  const overlay = await app.firstWindow();
  await overlay.waitForFunction(() => !!window.glint, null, { timeout: 15000 });
  await waitFor(async () => (await overlay.evaluate(() => window.glint.test.getWindowState())).value?.visible === true, 'overlay visible');

  const state = await overlay.evaluate(() => window.glint.test.getWindowState());
  console.log('getWindowState(overlay):', JSON.stringify(state));
  check('overlay visible', state.ok && state.value.visible);
  check('alwaysOnTop', state.ok && state.value.alwaysOnTop, state.value?.alwaysOnTopLevel);
  check('alwaysOnTopLevel screen-saver', state.ok && state.value.alwaysOnTopLevel === 'screen-saver');
  check('contentProtection', state.ok && state.value.contentProtection);
  check('windowKind overlay', (await overlay.evaluate(() => window.glint.windowKind)) === 'overlay');
  check('html.glint-protected class', await overlay.evaluate(() => document.documentElement.classList.contains('glint-protected')));

  const kb = await overlay.evaluate(() => window.glint.settings.keybinds());
  for (const k of kb.value) console.log(`keybind ${k.id.padEnd(18)} ${k.accelerators.join(', ').padEnd(70)} scope=${k.scope.padEnd(12)} registered=${k.registered}`);
  check('all hotkeys registered while visible', kb.ok && kb.value.every((k) => k.registered));

  // Hide via the same handler ⌘\ runs; whileVisible keys must unregister, always keys stay.
  await overlay.evaluate(() => window.glint.test.triggerHotkey('toggleOverlay'));
  const hidden = await overlay.evaluate(() => window.glint.test.getWindowState());
  const kbHidden = await overlay.evaluate(() => window.glint.settings.keybinds());
  console.log('after toggle: visible =', hidden.value.visible, '| registered:', kbHidden.value.map((k) => `${k.id}=${k.registered}`).join(' '));
  check('toggle hides overlay', hidden.ok && hidden.value.visible === false);
  check('whileVisible keys unregistered when hidden', kbHidden.value.filter((k) => k.scope === 'whileVisible').every((k) => !k.registered));
  check('always keys stay registered when hidden', kbHidden.value.filter((k) => k.scope === 'always').every((k) => k.registered));
  await overlay.evaluate(() => window.glint.test.triggerHotkey('toggleOverlay'));
  const shown = await overlay.evaluate(() => window.glint.test.getWindowState());
  check('toggle shows overlay again', shown.ok && shown.value.visible === true);

  // Move with ⌘→ handler.
  const before = shown.value.bounds;
  await overlay.evaluate(() => window.glint.test.triggerHotkey('moveWindow', 'right'));
  const moved = (await overlay.evaluate(() => window.glint.test.getWindowState())).value.bounds;
  console.log('move right:', before.x, '->', moved.x);
  check('⌘→ moves overlay', moved.x > before.x);

  // Click-through toggle.
  await overlay.evaluate(() => window.glint.test.triggerHotkey('toggleClickThrough'));
  const ct = await overlay.evaluate(() => window.glint.test.getWindowState());
  check('click-through sets ignoreMouseEvents', ct.value.ignoreMouseEvents === true);
  await overlay.evaluate(() => window.glint.overlay.setClickThrough(false));

  // Stubs answer with NOT_IMPLEMENTED (until AI/Audio replace them).
  const askRes = await overlay.evaluate(() => window.glint.ask.ask('hello'));
  console.log('ask stub:', JSON.stringify(askRes));

  // Dashboard also protected.
  await overlay.evaluate(() => window.glint.app.openDashboard({ view: 'settings' }));
  const dash = await app.waitForEvent('window', { timeout: 10000 });
  await dash.waitForFunction(() => !!window.glint, null, { timeout: 10000 });
  await waitFor(async () => (await overlay.evaluate(() => window.glint.test.getWindowState('dashboard'))).value?.visible === true, 'dashboard visible');
  const dstate = await overlay.evaluate(() => window.glint.test.getWindowState('dashboard'));
  console.log('getWindowState(dashboard):', JSON.stringify(dstate));
  check('dashboard visible', dstate.ok && dstate.value.visible);
  check('dashboard contentProtection', dstate.ok && dstate.value.contentProtection);
  check('dashboard windowKind', (await dash.evaluate(() => window.glint.windowKind)) === 'dashboard');

  // Main-process view (Playwright electronApp.evaluate).
  const mainView = await app.evaluate(() => globalThis.__glintTest.windowState('overlay'));
  check('main __glintTest agrees', mainView.contentProtection === true && mainView.alwaysOnTop === true);
} catch (err) {
  check('no exception', false, String(err));
} finally {
  await app.close().catch(() => {});
}

console.log('\n--- main-process log lines ---');
for (const l of logs.filter((l) => l.includes('[glint:'))) console.log(l);
console.log('\n--- checks ---');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

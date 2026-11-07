#!/usr/bin/env node
// UI visual self-check (UI agent). Launches Glint with Playwright's Electron driver (GLINT_TEST=1,
// its own GLINT_DATA_DIR) and screenshots every overlay/dashboard state into test-output/ui/.
//
// Two kinds of shots:
//   real-*.png     the renderer driven by the real backend (whatever is implemented right now)
//   <state>.png    DEV-ONLY visual fixtures (?fixture=...) for states whose backend may not exist
//                  yet. They are for layout comparison with research/screens/*.png only and are
//                  NEVER proof that a feature works.
//
// Usage: node scripts/ui_shots.mjs [--only name1,name2] [--protected]
//   npm run build first (this script does not build).
//   --only       capture only these shot names (e.g. --only ask-answer,history)
//   --protected  keep "Hide from screen share" on (dashed F42 borders) for every shot
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/ui_shots.mjs [--only name1,name2] [--protected]\nWrites PNGs to test-output/ui/. Run `npm run build` first.');
  process.exit(0);
}
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;
const keepProtected = args.includes('--protected');
const want = (name) => !only || only.has(name);

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'test-output', 'ui');
const dataDir = join(root, 'test-output', 'ui-data');
mkdirSync(outDir, { recursive: true });
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, GLINT_TEST: '1', GLINT_DATA_DIR: dataDir },
  timeout: 30000,
});
const logs = [];
app.process().stdout?.on('data', (d) => logs.push(String(d)));
app.process().stderr?.on('data', (d) => logs.push(String(d)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];

/** Resize a window from the main process (fixture scenes skip the overlay's fit-to-content). */
async function frame(kind, width, height) {
  await app.evaluate(
    ({ BrowserWindow, screen }, { kind, width, height }) => {
      const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes(`${kind}.html`));
      if (!w) throw new Error(`no ${kind} window`);
      const { workArea } = screen.getPrimaryDisplay();
      w.setBounds({ x: Math.round(workArea.x + (workArea.width - width) / 2), y: workArea.y + 8, width, height });
    },
    { kind, width, height },
  );
}

async function snap(page, name, note) {
  await page.evaluate(() => document.fonts.ready);
  // A page screenshot can't render the dashboard's native vibrancy (the see-through sidebar comes out dark),
  // so page shots show the solid fallback. history-vibrancy-* are real screen captures of the real material.
  const dropped = await page.evaluate(() => {
    const had = document.documentElement.classList.contains('glint-vibrancy');
    document.documentElement.classList.remove('glint-vibrancy');
    return had;
  });
  if (dropped) note = `${note ?? ''}${note ? '; ' : ''}page shot: vibrancy fallback`;
  await sleep(350);
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  shots.push({ name, path, note });
  console.log(`saved ${path}${note ? `  (${note})` : ''}`);
}

try {
  const overlay = await app.firstWindow();
  await overlay.waitForFunction(() => !!window.glint, null, { timeout: 15000 });
  const overlayUrl = overlay.url().split('?')[0];
  overlay.on('console', (m) => m.type() === 'error' && console.log('[overlay console]', m.text()));
  overlay.on('pageerror', (e) => console.log('[overlay pageerror]', e.message));

  if (!keepProtected) await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: false }));
  // No screen capture from this script (avoids a Screen Recording prompt); this data dir is throwaway.
  await overlay.evaluate(() => window.glint.settings.set({ attachScreenshotByDefault: false }));

  // ---- Real backend states ----
  if (want('real-overlay')) {
    await sleep(600);
    const st = await overlay.evaluate(() => window.glint.session.getStatus());
    console.log('real session:getStatus ->', JSON.stringify(st));
    await snap(overlay, 'real-overlay', 'real renderer, real backend, transparent window');
  }
  if (want('real-composer')) {
    await overlay.click('#ask-btn');
    await snap(overlay, 'real-composer', 'real: Ask clicked');
  }
  if (want('real-ask')) {
    // A real ask through the AI module: shows whatever the backend returns (answer or its error).
    await overlay.fill('#input', 'In one sentence, what is Glint?');
    await overlay.press('#input', 'Enter');
    await sleep(6000);
    await snap(overlay, 'real-ask', 'real: typed question sent via ask:ask');
    await overlay.evaluate(() => window.glint.ask.clear());
  }

  // ---- DEV-ONLY fixtures, over a fake call scene ----
  const overlayShots = [
    // name, fixture, scene, width, height, zoom
    ['bar-idle', 'bar-idle', 'call', 1280, 720, 1.4],
    ['overlay-bar', 'bar-recording', 'call', 1280, 720, 1.4],
    ['live-insights', 'insights-idle', 'call', 1280, 720, 1.4],
    ['live-insights-content', 'insights-live', 'call', 1280, 720, 1.4],
    ['live-transcript', 'transcript', 'call', 1280, 720, 1.4],
    ['composer', 'composer', 'call', 1280, 720, 1.4],
    ['status-analyzing', 'ask-analyzing', 'call', 1280, 720, 1.4],
    ['status-thinking', 'ask-thinking', 'call', 1280, 720, 1.4],
    ['ask-streaming', 'ask-streaming', 'call', 1280, 720, 1.4],
    ['ask-answer', 'ask-answer', 'call', 1280, 720, 1.4],
    ['ask-answer-light', 'ask-answer', 'light', 624, 438, 1],
    ['ask-error', 'ask-error', 'call', 1280, 720, 1.4],
  ];
  for (const [name, fixture, scene, w, hgt, zoom] of overlayShots) {
    if (!want(name)) continue;
    await overlay.goto(`${overlayUrl}?fixture=${fixture}&scene=${scene}&zoom=${zoom}`);
    await overlay.waitForFunction(() => !!window.glint);
    await frame('overlay', w, hgt);
    await snap(overlay, name, `FIXTURE ${fixture}`);
  }
  // ---- Window-edge checks: no scene, the window sizes itself like the real app (fit()), and the
  // page is captured with its alpha channel. Composite these over light and dark backdrops
  // (scripts/ui_shots.mjs prints the command) to see anything cut off at the window edge.
  const alphaShots = [
    ['alpha-ask-answer', 'ask-answer'],
    ['alpha-composer', 'composer'],
    ['alpha-insights', 'insights-live'],
    ['alpha-bar', 'bar-recording'],
  ];
  for (const [name, fixture] of alphaShots) {
    if (!want(name)) continue;
    await overlay.goto(`${overlayUrl}?fixture=${fixture}`);
    await overlay.waitForFunction(() => !!window.glint);
    await overlay.evaluate(() => document.fonts.ready);
    await sleep(500);
    const path = join(outDir, `${name}.png`);
    await overlay.screenshot({ path, omitBackground: true, animations: 'disabled' });
    shots.push({ name, path, note: `FIXTURE ${fixture}, transparent window, alpha kept` });
    console.log(`saved ${path}  (alpha; window ${JSON.stringify(await overlay.evaluate(() => [innerWidth, innerHeight]))})`);
  }

  if (want('overlay-protected')) {
    await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: true }));
    await overlay.goto(`${overlayUrl}?fixture=insights-idle&scene=call&zoom=1.4`);
    await overlay.waitForFunction(() => !!window.glint);
    await frame('overlay', 1280, 720);
    await snap(overlay, 'overlay-protected', 'FIXTURE insights-idle with Hide from screen share ON (dashed)');
    if (!keepProtected) await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: false }));
  }

  // ---- Dashboard ----
  const dashWant = ['real-dashboard', 'real-settings-keybinds', 'history', 'history-1000', 'history-fallback', 'history-vibrancy-light', 'history-vibrancy-busy', 'history-vibrancy-dark', 'settings-about', 'history-transcript', 'history-usage', 'history-empty', 'settings-general', 'settings-keybinds', 'dashboard-protected'].some(want);
  if (dashWant) {
    const [dash] = await Promise.all([app.waitForEvent('window'), overlay.evaluate(() => window.glint.app.openDashboard({ view: 'history' }))]);
    await dash.waitForFunction(() => !!window.glint, null, { timeout: 15000 });
    dash.on('pageerror', (e) => console.log('[dashboard pageerror]', e.message));
    const dashUrl = dash.url().split('?')[0];
    await frame('dashboard', 1250, 900);

    if (want('real-dashboard')) {
      await sleep(800);
      const list = await dash.evaluate(() => window.glint.history.list());
      console.log('real history:list ->', JSON.stringify(list).slice(0, 300));
      await snap(dash, 'real-dashboard', 'real: history:list from the sessions module');
    }
    if (want('real-settings-keybinds')) {
      await frame('dashboard', 1194, 796);
      await dash.goto(`${dashUrl}?view=settings`);
      await dash.waitForFunction(() => !!window.glint);
      await dash.click('.s-nav[data-pane="keybinds"]');
      await dash.waitForSelector('.kb-row');
      await snap(dash, 'real-settings-keybinds', 'real: settings:keybinds from main');
      await dash.click('.s-nav[data-pane="general"]');
      await snap(dash, 'real-settings-general', 'real: settings:get + overlay:getState');
    }
    const dashShots = [
      ['history', 'history', 1250, 900],
      ['history-1000', 'history', 1000, 720], // the size tests/screens.spec.mjs captures at
      ['history-transcript', 'transcript', 1250, 900],
      ['history-usage', 'usage', 1250, 900],
      ['history-empty', 'empty', 1250, 900],
      ['settings-keybinds', 'settings-keybinds', 1194, 796],
      ['settings-general', 'settings-general', 1194, 796],
      ['settings-about', 'settings-keybinds', 1194, 796],
    ];
    for (const [name, fixture, w, hgt] of dashShots) {
      if (!want(name)) continue;
      await frame('dashboard', w, hgt);
      await dash.goto(`${dashUrl}?fixture=${fixture}`);
      await dash.waitForFunction(() => !!window.glint);
      await dash.waitForSelector(fixture.startsWith('settings') ? '.s-nav.on' : '.note > *');
      if (fixture === 'settings-keybinds') await dash.waitForSelector('.kb-row');
      if (name === 'settings-about') {
        await dash.click('.s-nav[data-pane="about"]');
        await dash.waitForFunction(() => document.querySelector('#about-version')?.textContent !== '–');
      }
      if (fixture === 'settings-general') {
        // Show the real defaults (both ON) in this shot, then restore the script's capture settings.
        await dash.evaluate(() => window.glint.settings.set({ hideFromScreenShare: true, attachScreenshotByDefault: true }));
        await sleep(300);
        await snap(dash, name, `FIXTURE ${fixture} (settings at their defaults)`);
        await dash.evaluate((p) => window.glint.settings.set({ hideFromScreenShare: p, attachScreenshotByDefault: false }), keepProtected);
        continue;
      }
      await snap(dash, name, `FIXTURE ${fixture}`);
    }
    // Fallback look (no NSVisualEffect): the same page with html.glint-vibrancy removed.
    if (want('history-fallback')) {
      await frame('dashboard', 1200, 800);
      await dash.goto(`${dashUrl}?fixture=history`);
      await dash.waitForSelector('.note > *');
      await dash.evaluate(() => document.documentElement.classList.remove('glint-vibrancy'));
      await snap(dash, 'history-fallback', 'FIXTURE history, vibrancy class removed (solid grey fallback)');
    }
    // Real screen captures: the page screenshot can't show native vibrancy, so put a backdrop window behind
    // the real dashboard (1200x800, the reference's window size) and capture that screen region.
    const backdrops = {
      light: 'background:#f3f1ec',
      busy: 'background:conic-gradient(from 30deg at 30% 40%,#ff5f6d,#ffc371,#47e5bc,#1f8ef1,#a855f7,#ff5f6d)',
      dark: 'background:linear-gradient(180deg,#59606e 0%,#8d7f84 45%,#3a2a22 80%,#120c08 100%)',
    };
    for (const [kind, css] of Object.entries(backdrops)) {
      const name = `history-vibrancy-${kind}`;
      if (!want(name)) continue;
      // Screen captures need "Hide from screen share" off; earlier settings shots toggle it, so set and check it.
      await dash.evaluate((p) => window.glint.settings.set({ hideFromScreenShare: p }), keepProtected);
      await sleep(300);
      const ws = await dash.evaluate(() => window.glint.test.getWindowState('dashboard'));
      if (ws.ok && ws.value.contentProtection !== keepProtected) throw new Error(`dashboard contentProtection is ${ws.value.contentProtection}; capture would be blank`);
      await dash.goto(`${dashUrl}?fixture=history`);
      await dash.waitForSelector('.note > *');
      const rect = await app.evaluate(async ({ BrowserWindow, screen }, css) => {
        const d = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('dashboard.html'));
        const { workArea } = screen.getPrimaryDisplay();
        const w = 1200, h = 800;
        d.setBounds({ x: Math.round(workArea.x + (workArea.width - w) / 2), y: workArea.y + 50, width: w, height: h });
        const b = d.getBounds();
        globalThis.__uiBackdrop?.destroy();
        const bg = new BrowserWindow({ x: b.x - 40, y: b.y - 40, width: b.width + 80, height: b.height + 80, frame: false, hasShadow: false, focusable: false, show: false });
        globalThis.__uiBackdrop = bg;
        await bg.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;height:100vh;${css}"></body>`));
        bg.showInactive();
        d.moveTop();
        return { x: b.x - 24, y: b.y - 24, width: b.width + 48, height: b.height + 48 };
      }, css);
      await sleep(900);
      const path = join(outDir, `${name}.png`);
      execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${rect.x},${rect.y},${rect.width},${rect.height}`, path]);
      shots.push({ name, path, note: `FIXTURE history, real screen capture over a ${kind} backdrop` });
      console.log(`saved ${path}  (screen capture, ${kind} backdrop)`);
    }
    await app.evaluate(() => globalThis.__uiBackdrop?.destroy()).catch(() => {});

    if (want('dashboard-protected')) {
      await dash.evaluate(() => window.glint.settings.set({ hideFromScreenShare: true }));
      await frame('dashboard', 1250, 900);
      await dash.goto(`${dashUrl}?fixture=history`);
      await dash.waitForSelector('.note > *');
      await snap(dash, 'dashboard-protected', 'FIXTURE history with Hide from screen share ON (dashed)');
    }
  }
} finally {
  await app.close().catch(() => {});
}
console.log(`\n${shots.length} screenshots in ${outDir}`);
if (shots.some((s) => s.name.startsWith('alpha-'))) {
  console.log('alpha-*.png keep transparency. Composite them on light/dark backdrops with Pillow, e.g.\n' +
    "  uv run --with pillow python3 -c \"from PIL import Image; a=Image.open('test-output/ui/alpha-ask-answer.png'); " +
    "b=Image.new('RGBA',a.size,'#f4f4f4'); b.alpha_composite(a); b.save('test-output/ui/alpha-ask-answer-on-light.png')\"");
}
const errs = logs.join('').split('\n').filter((l) => /error|uncaught/i.test(l) && !/NOT_IMPLEMENTED/.test(l));
if (errs.length) console.log('main-process lines mentioning errors:\n' + errs.slice(0, 15).join('\n'));

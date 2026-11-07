// Step 4 (not a gate): capture the five Glint screens from REAL app data for the look-and-feel council,
// with "Hide from screen share" OFF (so the dashed protected border does not show), then build side-by-sides.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { launchGlint, launchControl, openWin, closeWin, focusWin, display, winState, waitWindow, waitFor, img, quit, logTo, record, sleep, unwrap, OUT, ROOT } from './helpers.mjs';
import { CALL, DOC, WALLPAPER } from './fixtures/backdrops.mjs';

const SHOTS = join(OUT, 'screens'), CMP = join(OUT, 'compare');
mkdirSync(SHOTS, { recursive: true }); mkdirSync(CMP, { recursive: true });
const region = (file, r) => execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${r.x},${r.y},${r.width},${r.height}`, '-t', 'png', file]);

test('screens: five Glint screens from real data + side-by-sides', async () => {
  const log = logTo('screens.log');
  const clip = join(OUT, 'clip_screens.wav');
  const text = 'Hi Priya, thanks for making time today. We looked at the pilot results and the support team cut response times by about a third. ' +
    'The main concern from your side was data retention. Can you tell me how long call recordings are kept, and who on your team needs to approve the security questionnaire? ' +
    'We would like to roll out to forty agents next month.';
  execFileSync(join(ROOT, 'scripts/make_test_clip.sh'), [clip, text], { stdio: 'ignore' });
  let glint, ctl;
  const out = {};
  try {
    // Seed history with the real session from the d/e/g run (real app output, copied as-is).
    const seedFrom = join(OUT, 'data-deg');
    glint = await launchGlint({ dataDir: 'data-screens', log, settings: { hideFromScreenShare: false, attachScreenshotByDefault: true, answerModel: 'deepseek-v4-pro', liveModel: 'deepseek-flash' }, env: { GLINT_AUDIO_FILE: clip, GLINT_AUDIO_FILE_PACE: 'realtime' } });
    for (const d of readdirSync(seedFrom, { withFileTypes: true })) if (d.isDirectory()) cpSync(join(seedFrom, d.name), join(glint.dir, d.name), { recursive: true });
    const { app, overlay } = glint;
    ctl = await launchControl();
    const disp = await display(app);
    const wa = disp.workArea;
    const st0 = await winState(overlay);
    log('protection at start (expected false):', st0.contentProtection);
    expect(st0.contentProtection).toBe(false);

    // Layout: a pending macOS permission dialog sits mid-screen (x 605-864, y 176-433 pt) and a notification at top right,
    // and neither is ours to dismiss. So the overlay shots use a 16:9 backdrop in the clear bottom-left area and the overlay
    // is moved onto it with overlay:move. Bar/frame proportion (~0.45) is close to the references'.
    const call = { x: 0, y: disp.bounds.height - 470, width: 836, height: 470 };
    await openWin(ctl, 'call', { ...call, html: CALL });
    const b0 = (await winState(overlay)).bounds;
    unwrap(await overlay.evaluate((d) => window.glint.overlay.move(d), { dx: Math.round(call.x + call.width / 2 - (b0.x + b0.width / 2)), dy: call.y + 8 - b0.y }));
    log('overlay moved to', (await winState(overlay)).bounds);
    await waitFor(async () => unwrap(await overlay.evaluate(() => window.glint.ext.invoke('audio:getStats'))).worker.state === 'ready', { timeout: 90_000, label: 'whisper ready' });
    await focusWin(ctl, 'call');
    await sleep(500);

    // 1. overlay-bar: recording, Live Insights idle ("Start of Summary / No content yet...")
    await overlay.evaluate(() => { window.__segs = 0; window.glint.session.onSegment(() => window.__segs++); window.__ins = 0; window.glint.session.onInsights(() => window.__ins++); });
    await overlay.click('#listen');
    await waitFor(() => overlay.evaluate(() => !document.querySelector('#insights').hidden && !document.querySelector('#stop').hidden), { label: 'recording + insights panel' });
    await waitFor(() => overlay.evaluate(() => document.querySelector('#status').hidden), { timeout: 8000, label: 'status strip gone' }).catch(() => {});
    const idleState = await overlay.evaluate(() => ({ idle: document.querySelector('#ins-summary').classList.contains('idle'), segs: window.__segs, ins: window.__ins }));
    region(join(SHOTS, 'overlay-bar.png'), call);
    log('overlay-bar captured; state', idleState);
    out['overlay-bar'] = { state: idleState };

    // 2. live-suggestions: real insights from the clip
    await waitFor(() => overlay.evaluate(() => !document.querySelector('#ins-summary').classList.contains('idle') && document.querySelectorAll('#ins-actions .ins-act').length >= 2), { timeout: 90_000, label: 'insights' });
    await sleep(1500);
    await focusWin(ctl, 'call');
    region(join(SHOTS, 'live-suggestions.png'), call);
    const insText = await overlay.locator('#insights').innerText();
    log('live-suggestions captured; panel text:', insText);
    out['live-suggestions'] = { panelText: insText };

    // 3. ask-answer: real Assist (screen + transcript) over a light document
    // Full-height document column at the far left (x 0-600 pt stays clear of the dialog at x >= 605); overlay moved onto it.
    const docRect = { x: 0, y: wa.y, width: 600, height: wa.height };
    await openWin(ctl, 'doc', { ...docRect, html: DOC });
    const b1 = (await winState(overlay)).bounds;
    unwrap(await overlay.evaluate((d) => window.glint.overlay.move(d), { dx: 14 - b1.x, dy: wa.y + 160 - b1.y }));
    await sleep(600);
    await overlay.evaluate(() => { window.__done = null; window.glint.ask.onDone((e) => (window.__done = e)); });
    await overlay.click('#ask-btn');
    await overlay.click('.chip[data-quick="assist"]');
    const done = await waitFor(() => overlay.evaluate(() => window.__done), { timeout: 120_000, label: 'assist done' });
    await sleep(1200);
    // Like a user scrolling back up: show the question pill and "Sent with screenshot" as in the reference.
    await overlay.evaluate(() => document.querySelector('#ask-scroll').scrollTo({ top: 0 }));
    await sleep(500);
    const st = await winState(overlay);
    const askRect = { x: Math.max(0, st.bounds.x - 14), y: st.bounds.y - 20, width: Math.min(600, st.bounds.width + 28), height: st.bounds.height + 40 };
    log('ask overlay bounds', st.bounds, 'capture rect', askRect);
    await focusWin(ctl, 'doc');
    region(join(SHOTS, 'ask-answer.png'), askRect);
    log('ask-answer captured; meta', done.meta, 'answer head:', done.answer.slice(0, 300));
    out['ask-answer'] = { meta: done.meta, answerHead: done.answer.slice(0, 400) };
    await overlay.click('#ask-close').catch(() => {});

    // Stop the session -> notes saved
    await overlay.evaluate(() => { window.__saved = null; window.glint.session.onStatus((s) => { if (s.state === 'saved' || s.state === 'error') window.__saved = s; }); });
    await overlay.click('#stop');
    const saved = await waitFor(() => overlay.evaluate(() => window.__saved), { timeout: 180_000, label: 'saved' });
    log('session saved', saved);
    await closeWin(ctl, 'call'); await closeWin(ctl, 'doc');

    // 4. notes-history (D-C6): match the reference framing with real windows. Reference = 2502x1800 px at 2x
    // = 1251x900 pt: wallpaper, the overlay bar at top centre, a ~1200x800 pt dashboard window below it.
    const reg = { x: Math.round((disp.bounds.width - 1251) / 2), y: wa.y, width: 1251, height: 900 };
    await openWin(ctl, 'wall', { ...reg, html: WALLPAPER, focus: false });
    // overlay back to its default top-centre spot, idle bar only
    const b2 = (await winState(overlay)).bounds;
    unwrap(await overlay.evaluate((d) => window.glint.overlay.move(d), { dx: Math.round(disp.bounds.width / 2 - (b2.x + b2.width / 2)), dy: wa.y + 8 - b2.y }));
    await overlay.evaluate((id) => window.glint.app.openDashboard({ view: 'history', sessionId: id }), saved.sessionId);
    const dash = await waitWindow(app, 'dashboard.html');
    await app.evaluate(({ BrowserWindow }, b) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('dashboard')); w.setBounds(b); w.focus(); }, { x: reg.x + 26, y: reg.y + 56, width: 1200, height: 800 });
    await waitFor(async () => (await dash.locator('#history-list').innerText()).includes('Security Review'), { timeout: 20_000, label: 'history rows' });
    await waitFor(() => overlay.evaluate(() => document.querySelector('#status').hidden), { timeout: 12_000, label: 'status strip gone' }).catch(() => {});
    await sleep(1200);
    region(join(SHOTS, 'notes-history.png'), reg);
    out['notes-history'] = { list: await dash.locator('#history-list').innerText(), capture: 'region 1251x900 pt: wallpaper + overlay bar + 1200x800 dashboard' };
    log('notes-history captured; list:', out['notes-history'].list);
    await closeWin(ctl, 'wall');

    // 5. settings: Keybinds pane, window-only capture
    await overlay.evaluate(() => window.glint.overlay.hide());
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('dashboard')); w.setBounds({ ...w.getBounds(), width: 1194, height: 796 }); });
    await overlay.evaluate(() => window.glint.app.openDashboard({ view: 'settings' }));
    await dash.waitForSelector('.s-nav[data-pane="keybinds"]', { state: 'visible' });
    await dash.click('.s-nav[data-pane="keybinds"]');
    await dash.waitForSelector('.kb-row');
    await sleep(800);
    const wid = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('dashboard')).getMediaSourceId());
    execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', wid.split(':')[1], '-t', 'png', join(SHOTS, 'settings.png')]);
    out.settings = { keybinds: await dash.locator('#keybinds').innerText() };
    log('settings captured; keybinds text:', out.settings.keybinds);

    // Side-by-sides
    for (const s of ['overlay-bar', 'ask-answer', 'live-suggestions', 'notes-history', 'settings']) {
      out[s].compare = img('sidebyside', join(ROOT, 'research/screens', `${s}.png`), join(SHOTS, `${s}.png`), join(CMP, `${s}.png`), '--height', 900).out;
      log('compare', s, '->', out[s].compare);
    }
  } finally {
    record('screens', { note: 'not a gate; captured with Hide from screen share OFF', measured: out });
    await quit(ctl);
    await quit(glint?.app);
  }
});

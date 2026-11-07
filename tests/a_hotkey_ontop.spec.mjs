// Verification (a): ⌘\ as a REAL OS key press toggles the overlay both ways; overlay stays on top of another app window.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchGlint, launchControl, openWin, focusWin, winState, display, capture, ocrVision, img, osKey, osKeyTimed, cgKey, waitFor, elementScreenRect, quit, logTo, record, sleep, OUT, BACKDROP_PLAIN } from './helpers.mjs';

test('a: hotkey toggles overlay (real key press) + always on top', async () => {
  const log = logTo('a_hotkey_ontop.log');
  let glint, ctl;
  const res = { hotkey: {}, ontop: {} };
  try {
    glint = await launchGlint({ dataDir: 'data-a', log });
    const { app, overlay } = glint;
    ctl = await launchControl();
    const disp = await display(app);
    log('display', disp);
    await waitFor(async () => (await winState(overlay)).visible, { label: 'overlay visible at launch' });
    let st = await winState(overlay);
    log('overlay state at launch', st);

    // A magenta control window from another app covering the overlay area, focused (frontmost).
    const wa = disp.workArea;
    const cb = { x: wa.x + Math.round((wa.width - 1000) / 2), y: wa.y, width: 1000, height: 420 };
    await openWin(ctl, 'magenta', { ...cb, html: BACKDROP_PLAIN('CONTROL WINDOW', '#ff00ff') });
    await sleep(800);
    await focusWin(ctl, 'magenta');
    await sleep(500);

    // ---- Hotkey: real OS key press. Route 1: CGEvent (HID tap). Route 2: osascript System Events. ----
    const flipTo = async (want) => { try { return await waitFor(async () => { const s = await winState(overlay); return s.visible === want ? s : null; }, { timeout: 3000, label: 'visibility ' + want }); } catch { return await winState(overlay); } };
    const tryRoute = async (name, press) => {
      await focusWin(ctl, 'magenta'); await sleep(300);
      const before = (await winState(overlay)).visible;
      const k1 = press(); log(name, 'press 1 ->', k1);
      const a1 = await flipTo(!before); log(name, 'after press 1 visible=', a1.visible);
      const k2 = press(); log(name, 'press 2 ->', k2);
      const a2 = await flipTo(before); log(name, 'after press 2 visible=', a2.visible);
      if (!(await winState(overlay)).visible) await overlay.evaluate(() => window.glint.overlay.show());
      return { route: name, press1: k1, press2: k2, before, after1: a1.visible, after2: a2.visible, flippedBothWays: a1.visible !== before && a2.visible === before };
    };
    const r1 = await tryRoute('CGEvent', () => cgKey(42, ['cmd']));
    const r2 = r1.flippedBothWays ? null : await tryRoute('osascript', () => osKeyTimed(42, 10));
    const ok = r1.flippedBothWays || r2?.flippedBothWays;
    const denied = !r1.press1.postEventAccess && (!r2 || !r2.press1.ok);
    res.hotkey = { routes: [r1, r2].filter(Boolean), status: ok ? 'PASS' : denied ? 'BLOCKED' : 'FAIL',
      reason: ok ? undefined : denied ? `CGEvent: CGPreflightPostEventAccess=${r1.press1.postEventAccess}; osascript: ${r2?.press1.error ?? 'not tried'}` : 'key posted but overlay did not flip' };
    log('hotkey result', res.hotkey.status, res.hotkey.reason ?? '');

    // ---- Always on top ----
    await focusWin(ctl, 'magenta');
    await sleep(600);
    st = await winState(overlay);
    log('overlay state for on-top check', st);
    const bar = await elementScreenRect(overlay, '#bar', st.bounds);
    log('bar screen rect (pt)', bar);
    const shotOn = capture(join(OUT, 'a_ontop_protection_on.png'));
    await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: false }));
    await sleep(700);
    await focusWin(ctl, 'magenta');
    await sleep(500);
    const stOff = await winState(overlay);
    const shotOff = capture(join(OUT, 'a_ontop_protection_off.png'));
    const { width: capW } = img('info', shotOff);
    const s = capW / disp.bounds.width;
    const px = (r) => [Math.round(r.x * s), Math.round(r.y * s), Math.round(r.width * s), Math.round(r.height * s)];
    const barPx = px(bar);
    const ctlBelow = px({ x: cb.x + 40, y: bar.y + bar.height + 30, width: cb.width - 80, height: 60 });
    // The capture is colour-managed (#ff00ff lands near 234,51,247), so sample the control colour from the capture itself.
    const sample = px({ x: cb.x + 10, y: cb.y + cb.height - 20, width: 20, height: 10 });
    const ctlColor = img('meancolor', shotOff, ...sample).mean.map(Math.round);
    const magBarOff = img('colorfrac', shotOff, ...barPx, ...ctlColor, 14).fraction;
    const magBarOn = img('colorfrac', shotOn, ...barPx, ...ctlColor, 14).fraction;
    const magCtl = img('colorfrac', shotOff, ...ctlBelow, ...ctlColor, 14).fraction;
    log('control colour as captured', ctlColor);
    img('crop', shotOff, join(OUT, 'a_ontop_bar_crop_protection_off.png'), barPx[0] - 60, barPx[1] - 40, barPx[2] + 120, barPx[3] + 140);
    img('crop', shotOn, join(OUT, 'a_ontop_bar_crop_protection_on.png'), barPx[0] - 60, barPx[1] - 40, barPx[2] + 120, barPx[3] + 140);
    const ocrBar = ocrVision(join(OUT, 'a_ontop_bar_crop_protection_off.png')).text;
    const frontmost = await ctl.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle() ?? null);
    log({ capW, scale: s, barPx, magBarOff, magBarOn, magCtl, ocrBar, controlFocused: frontmost });
    await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: true }));
    res.ontop = {
      alwaysOnTop: st.alwaysOnTop, level: st.alwaysOnTopLevel, contentProtectionDuringOffShot: stOff.contentProtection,
      magentaFractionInBarRect_protectionOff: magBarOff, magentaFractionInBarRect_protectionOn: magBarOn, magentaFractionControlArea: magCtl,
      ocrOfBarCrop: ocrBar, controlColourAsCaptured: ctlColor, controlWindowFocused: frontmost !== null,
    };
    const pixelsOnTop = magCtl > 0.6 && magBarOff < 0.1;
    const ocrOk = /Show|Hide|Ask/i.test(ocrBar);
    res.ontop.status = st.alwaysOnTop && st.alwaysOnTopLevel === 'screen-saver' && pixelsOnTop && ocrOk ? 'PASS' : 'FAIL';
  } finally {
    record('a_hotkey', { status: res.hotkey.status, threshold: 'real OS ⌘\\ press (osascript) toggles overlay visibility both ways; BLOCKED if Accessibility denies key posting', measured: res.hotkey, evidence: ['test-output/checker/a_hotkey_ontop.log'] });
    record('a_ontop', { status: res.ontop.status ?? 'FAIL', threshold: 'alwaysOnTop true at level screen-saver AND capture with protection off shows overlay pixels over another app window covering the same area', measured: res.ontop, evidence: ['test-output/checker/a_ontop_protection_off.png', 'test-output/checker/a_ontop_bar_crop_protection_off.png', 'test-output/checker/a_ontop_bar_crop_protection_on.png', 'test-output/checker/a_hotkey_ontop.log'] });
    await quit(ctl);
    await quit(glint?.app);
  }
  expect.soft(res.hotkey.status, JSON.stringify(res.hotkey)).not.toBe('FAIL');
  expect(res.ontop.status, JSON.stringify(res.ontop)).toBe('PASS');
});

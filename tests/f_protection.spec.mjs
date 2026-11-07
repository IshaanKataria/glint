// Verification (f): content protection. Overlay shows a random marker; a control window (other app) shows another.
// Protection ON: control marker found, overlay marker absent. Protection OFF (positive control): overlay marker found.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchGlint, launchControl, openWin, focusWin, display, winState, capture, ocrVision, ocrTesseract, hasMarker, img, elementScreenRect, quit, logTo, record, sleep, marker, OUT } from './helpers.mjs';

test('f: overlay hidden from screencapture, visible with protection off', async () => {
  const log = logTo('f_protection.log');
  let glint, ctl;
  const r = {};
  try {
    glint = await launchGlint({ dataDir: 'data-f', log });
    const { app, overlay } = glint;
    ctl = await launchControl();
    const disp = await display(app);
    const ovMark = marker('OVL');
    const ctlMark = marker('CTL');
    log('overlay marker', ovMark, '| control marker', ctlMark);
    const wa = disp.workArea;
    await openWin(ctl, 'control', { x: wa.x + 40, y: wa.y + wa.height - 300, width: 700, height: 260, frame: true, html: `<!doctype html><html><head><title>Checker control</title></head><body style="margin:0;background:#fff;font:700 52px -apple-system,Helvetica;color:#111;padding:50px">${ctlMark}</body></html>` });
    await sleep(600);
    await focusWin(ctl, 'control');
    // Put the overlay marker into the overlay: open the composer and type it (not submitted).
    await overlay.click('#ask-btn');
    await overlay.waitForSelector('#input', { state: 'visible' });
    await overlay.fill('#input', ovMark);
    await sleep(800);
    const st = await winState(overlay);
    log('overlay state (protection on)', st);
    const inputRect = await elementScreenRect(overlay, '#input', st.bounds);
    const s = 2940 / disp.bounds.width;
    const ovPx = [Math.round(st.bounds.x * s), Math.round(st.bounds.y * s), Math.round(st.bounds.width * s), Math.round(st.bounds.height * s)];

    const on = capture(join(OUT, 'f_capture_protection_on.png'));
    const cropOn = join(OUT, 'f_overlay_region_protection_on.png');
    img('crop', on, cropOn, ...ovPx);
    const vOn = ocrVision(on).text, tOn = ocrTesseract(on);
    const vCropOn = ocrVision(cropOn).text;
    r.on = { contentProtection: st.contentProtection, overlayVisible: st.visible, controlFound_vision: hasMarker(vOn, ctlMark), controlFound_tesseract: hasMarker(tOn, ctlMark), overlayMarkerFound_vision: hasMarker(vOn, ovMark), overlayMarkerFound_tesseract: hasMarker(tOn, ovMark), overlayMarkerFound_cropVision: hasMarker(vCropOn, ovMark), overlayUiTextInCrop: /Ask about your screen|Assist|Recap/i.test(vCropOn) };
    log('protection ON', r.on);

    await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: false }));
    await sleep(800);
    const st2 = await winState(overlay);
    const off = capture(join(OUT, 'f_capture_protection_off.png'));
    const cropOff = join(OUT, 'f_overlay_region_protection_off.png');
    img('crop', off, cropOff, Math.round(st2.bounds.x * s), Math.round(st2.bounds.y * s), Math.round(st2.bounds.width * s), Math.round(st2.bounds.height * s));
    const vOff = ocrVision(off).text, tOff = ocrTesseract(off);
    const vCropOff = ocrVision(cropOff).text;
    r.off = { contentProtection: st2.contentProtection, overlayVisible: st2.visible, controlFound_vision: hasMarker(vOff, ctlMark), overlayMarkerFound_vision: hasMarker(vOff, ovMark), overlayMarkerFound_tesseract: hasMarker(tOff, ovMark), overlayMarkerFound_cropVision: hasMarker(vCropOff, ovMark), cropOcr: vCropOff.slice(0, 300) };
    log('protection OFF', r.off);
    await overlay.evaluate(() => window.glint.settings.set({ hideFromScreenShare: true }));
    Object.assign(r, { overlayMarker: ovMark, controlMarker: ctlMark, inputRect });
    const onOk = r.on.contentProtection && r.on.overlayVisible && (r.on.controlFound_vision || r.on.controlFound_tesseract) && !r.on.overlayMarkerFound_vision && !r.on.overlayMarkerFound_tesseract && !r.on.overlayMarkerFound_cropVision;
    const offOk = !r.off.contentProtection && (r.off.overlayMarkerFound_vision || r.off.overlayMarkerFound_tesseract || r.off.overlayMarkerFound_cropVision);
    r.status = onOk && offOk ? 'PASS' : 'FAIL';
  } finally {
    record('f_protection', { status: r.status ?? 'FAIL', threshold: 'protection on: control marker found in OCR of the capture, overlay marker NOT found; protection off (positive control): overlay marker found', measured: r, evidence: ['test-output/checker/f_capture_protection_on.png', 'test-output/checker/f_capture_protection_off.png', 'test-output/checker/f_overlay_region_protection_on.png', 'test-output/checker/f_overlay_region_protection_off.png', 'test-output/checker/f_protection.log'] });
    await quit(ctl);
    await quit(glint?.app);
  }
  expect(r.status, JSON.stringify(r)).toBe('PASS');
});

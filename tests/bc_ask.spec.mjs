// Verification (b) typed ask -> real streamed deepseek-v4-pro answer; (c) screenshot ask -> OCR + answer contain a per-run random code.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { launchGlint, launchControl, openWin, focusWin, display, ocrVision, ocrTesseract, hasMarker, waitFor, quit, logTo, record, sleep, OUT } from './helpers.mjs';

/** Instrument the overlay renderer: collect ask events in window.__chk. */
async function instrument(overlay) {
  await overlay.evaluate(() => {
    const c = (window.__chk = { chunks: [], status: [], done: [], errors: [] });
    window.glint.ask.onChunk((e) => c.chunks.push({ id: e.requestId, n: e.delta.length, t: Date.now() }));
    window.glint.ask.onStatus((e) => c.status.push(e));
    window.glint.ask.onDone((e) => c.done.push(e));
    window.glint.ask.onError((e) => c.errors.push(e));
  });
}

/** Type into the overlay composer and press Enter, like a user. */
async function typeAsk(overlay, text) {
  await overlay.evaluate(() => (window.__chk.chunks = [], window.__chk.status = [], window.__chk.done = [], window.__chk.errors = []));
  await overlay.click('#ask-btn');
  await overlay.waitForSelector('#input', { state: 'visible' });
  await overlay.fill('#input', text);
  const t0 = Date.now();
  await overlay.press('#input', 'Enter');
  const done = await waitFor(() => overlay.evaluate(() => window.__chk.done[0] ?? (window.__chk.errors[0] ? { error: window.__chk.errors[0] } : null)), { timeout: 120_000, label: 'ask done' });
  const c = await overlay.evaluate(() => window.__chk);
  const domAnswer = await overlay.locator('#answer').innerText();
  const shotNoteVisible = await overlay.locator('#shot-note').isVisible();
  return { done, chunks: c.chunks.length, firstChunkMs: c.chunks[0] ? c.chunks[0].t - t0 : null, totalMs: Date.now() - t0, stages: c.status.map((s) => s.stage), domAnswer, shotNoteVisible };
}

test('b+c: typed ask and screenshot ask', async () => {
  const log = logTo('bc_ask.log');
  const keep = join(OUT, 'c_app_screenshot_kept.png');
  let glint, ctl;
  const rb = {}, rc = {};
  try {
    glint = await launchGlint({ dataDir: 'data-bc', log, env: { GLINT_KEEP_SCREENSHOT: keep } });
    const { app, overlay } = glint;
    await instrument(overlay);

    // (b) typed ask with a per-run checkable answer
    const a = randomInt(31, 99), b = randomInt(31, 99);
    const qb = `What is ${a} multiplied by ${b}? Reply with just the number.`;
    log('(b) question:', qb, 'expected', a * b);
    const B = await typeAsk(overlay, qb);
    log('(b) result', { model: B.done.meta?.model, chunks: B.chunks, firstChunkMs: B.firstChunkMs, totalMs: B.totalMs, stages: B.stages, answer: B.done.answer, usedScreenshot: B.done.meta?.usedScreenshot, error: B.done.error });
    log('(b) answer text in overlay DOM:', B.domAnswer);
    await overlay.screenshot({ path: join(OUT, 'b_typed_ask_overlay.png') });
    const nums = (B.done.answer ?? '').replace(/,/g, '').match(/\d+/g) ?? [];
    Object.assign(rb, { question: qb, expected: a * b, answer: B.done.answer, model: B.done.meta?.model, streamedChunks: B.chunks, firstChunkMs: B.firstChunkMs, totalMs: B.totalMs, domShowsAnswer: B.domAnswer.replace(/,/g, '').includes(String(a * b)), error: B.done.error });
    rb.status = !B.done.error && B.done.meta?.model === 'deepseek-v4-pro' && B.chunks >= 2 && nums.includes(String(a * b)) && rb.domShowsAnswer ? 'PASS' : 'FAIL';

    // (c) screenshot ask: a real window (separate app) shows a random code
    ctl = await launchControl();
    const disp = await display(app);
    const code = `${randomInt(100, 999)}-${randomInt(100, 999)}`;
    const word = ['HARBOR', 'MAPLE', 'COMET', 'TUNDRA', 'VELVET', 'QUARTZ'][randomInt(6)];
    const secret = `${word} ${code}`;
    const wa = disp.workArea;
    await openWin(ctl, 'code', {
      x: wa.x + 40, y: wa.y + wa.height - 440, width: 900, height: 420, frame: true, // lower left: clear of centred system dialogs (run 1 was covered by a TCC prompt)
      html: `<!doctype html><html><head><title>Checker code window</title></head><body style="margin:0;background:#fff;font:600 44px -apple-system,Helvetica;color:#111;padding:60px"><div>Deployment checklist</div><div style="margin-top:40px">The access code is ${secret}</div><div style="margin-top:30px;font-size:26px;color:#444">Keep this window open during the check.</div></body></html>`,
    });
    await sleep(800);
    await focusWin(ctl, 'code');
    await sleep(500);
    const qc = 'What is the access code shown in the window on my screen? Reply with just the code.';
    log('(c) secret shown on screen:', secret, '| question (does not contain it):', qc);
    const C = await typeAsk(overlay, qc);
    log('(c) result', { model: C.done.meta?.model, usedScreenshot: C.done.meta?.usedScreenshot, ocrChars: C.done.meta?.ocrChars, chunks: C.chunks, stages: C.stages, answer: C.done.answer, error: C.done.error, shotNoteVisible: C.shotNoteVisible });
    await overlay.screenshot({ path: join(OUT, 'c_screenshot_ask_overlay.png') });
    const ocr = ocrVision(keep);
    const tess = ocrTesseract(keep);
    const ocrHas = hasMarker(ocr.text, secret);
    log('(c) OCR (Vision) of the image the app sent through OCR contains secret:', ocrHas, '| tesseract:', hasMarker(tess, secret));
    log('(c) OCR lines with "access":', ocr.text.split('\n').filter((l) => /access/i.test(l)));
    Object.assign(rc, { secret, question: qc, answer: C.done.answer, model: C.done.meta?.model, usedScreenshot: C.done.meta?.usedScreenshot, ocrChars: C.done.meta?.ocrChars, stages: C.stages, ocrContainsSecret: ocrHas, tesseractContainsSecret: hasMarker(tess, secret), answerContainsSecret: hasMarker(C.done.answer ?? '', code), shotNoteVisible: C.shotNoteVisible, error: C.done.error });
    rc.status = rc.usedScreenshot === true && rc.ocrContainsSecret && rc.answerContainsSecret ? 'PASS' : 'FAIL';
  } finally {
    record('b_typed_ask', { status: rb.status ?? 'FAIL', threshold: 'non-empty answer from deepseek-v4-pro, received as streamed chunks, factually right for a checkable question', measured: rb, evidence: ['test-output/checker/bc_ask.log', 'test-output/checker/b_typed_ask_overlay.png'] });
    record('c_screenshot_ask', { status: rc.status ?? 'FAIL', threshold: 'real window shows a random per-run code; OCR text contains it; answer contains it; usedScreenshot true', measured: rc, evidence: ['test-output/checker/bc_ask.log', 'test-output/checker/c_app_screenshot_kept.png', 'test-output/checker/c_screenshot_ask_overlay.png'] });
    await quit(ctl);
    await quit(glint?.app);
  }
  expect.soft(rb.status, JSON.stringify(rb)).toBe('PASS');
  expect(rc.status, JSON.stringify(rc)).toBe('PASS');
});

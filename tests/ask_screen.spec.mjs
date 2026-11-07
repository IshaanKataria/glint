// Step 4 (not a gate): ask-answer screen from a REAL Assist answer with screenshot context, protection OFF,
// over a full-screen neutral document (no other app in frame or in the OCR), scrolled to the top.
// Usage: CHECKER_TRY=<n> npx playwright test -c tests/playwright.config.mjs ask_screen
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchGlint, launchControl, openWin, focusWin, display, winState, waitFor, img, quit, logTo, record, sleep, OUT, ROOT } from './helpers.mjs';
import { DOC_FULL } from './fixtures/backdrops.mjs';

const TRY = process.env.CHECKER_TRY ?? '1';
const SHOTS = join(OUT, 'screens'), CMP = join(OUT, 'compare');
mkdirSync(SHOTS, { recursive: true }); mkdirSync(CMP, { recursive: true });

test('screens: ask-answer from a real Assist answer', async () => {
  const log = logTo(`ask_screen_try${TRY}.log`);
  let glint, ctl;
  const out = { try: TRY };
  try {
    glint = await launchGlint({ dataDir: 'data-askscreen', log, settings: { hideFromScreenShare: false, attachScreenshotByDefault: true, answerModel: 'deepseek-v4-pro', liveModel: 'deepseek-flash' } });
    const { app, overlay } = glint;
    ctl = await launchControl();
    const disp = await display(app);
    const wa = disp.workArea;
    await openWin(ctl, 'doc', { x: wa.x, y: wa.y, width: wa.width, height: wa.height, html: DOC_FULL });
    await sleep(800);
    await focusWin(ctl, 'doc');
    await sleep(400);
    const st0 = await winState(overlay);
    log('protection (expected false):', st0.contentProtection, 'overlay', st0.bounds);
    expect(st0.contentProtection).toBe(false);
    await overlay.evaluate(() => { window.__done = null; window.__err = null; window.glint.ask.onDone((e) => (window.__done = e)); window.glint.ask.onError((e) => (window.__err = e)); });
    await overlay.click('#ask-btn');
    await overlay.click('.chip[data-quick="assist"]');
    const done = await waitFor(() => overlay.evaluate(() => window.__done ?? (window.__err ? { error: window.__err } : null)), { timeout: 150_000, label: 'assist done' });
    if (done.error) throw new Error('assist error ' + JSON.stringify(done.error));
    await sleep(1200);
    await overlay.evaluate(() => document.querySelector('#ask-scroll').scrollTo({ top: 0 }));
    await sleep(600);
    await focusWin(ctl, 'doc');
    await sleep(400);
    const st = await winState(overlay);
    const dom = await overlay.evaluate(() => ({ pill: document.querySelector('#q-bubble').innerText, shotNote: !document.querySelector('#shot-note').hidden, scrollTop: document.querySelector('#ask-scroll').scrollTop }));
    const rect = { x: st.bounds.x - 30, y: Math.max(wa.y, st.bounds.y - 8), width: st.bounds.width + 60, height: st.bounds.height + 40 };
    execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${rect.x},${rect.y},${rect.width},${rect.height}`, '-t', 'png', join(SHOTS, 'ask-answer.png')]);
    out.meta = done.meta; out.answerHead = done.answer.slice(0, 400); out.dom = dom; out.rect = rect;
    log('captured', { meta: done.meta, dom, rect });
    log('answer head:', out.answerHead);
    out.compare = img('sidebyside', join(ROOT, 'research/screens/ask-answer.png'), join(SHOTS, 'ask-answer.png'), join(CMP, 'ask-answer.png'), '--height', 900).out;
    log('compare ->', out.compare);
    expect(done.meta.usedScreenshot).toBe(true);
    expect(dom.shotNote).toBe(true);
  } finally {
    record(`screens_ask_answer_try${TRY}`, { note: 'not a gate; protection OFF; real Assist answer', measured: out });
    await quit(ctl);
    await quit(glint?.app);
  }
});

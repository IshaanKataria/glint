// D-C9 (Lead D14): overlay-bar and live-suggestions captures over a single-speaker, full-frame call backdrop, from REAL app state.
// One real session (short `say` clip with 6 s of leading silence, realtime pace, real WhisperX + DeepSeek):
//  - overlay-bar: recording, Live Insights idle, during the leading silence. Region = top of the real screen incl. the real menu bar,
//    centred on the bar at its default position, width = bar width / 0.40 (reference ratio), 16:9.
//  - live-suggestions: the first moment after the first transcript segment and before the first insights arrive
//    ("Start of Summary / No content yet" + the Actions list). Region = below the menu bar, width = bar width / 0.45 (reference), 16:9.
// Usage: CHECKER_TRY=<n> npx playwright test -c tests/playwright.config.mjs call_screens
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchGlint, launchControl, openWin, focusWin, display, winState, waitFor, elementScreenRect, img, quit, logTo, record, sleep, unwrap, OUT, ROOT } from './helpers.mjs';
import { SPEAKER } from './fixtures/backdrops.mjs';

const TRY = process.env.CHECKER_TRY ?? '1';
const SHOTS = join(OUT, 'screens'), CMP = join(OUT, 'compare'), CLIPS = join(OUT, 'notes-clips');
const LINE = 'Thanks for joining. Could you walk me through how the pilot went for your support team?';
const region = (file, r) => execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${r.x},${r.y},${r.width},${r.height}`, '-t', 'png', file]);

function makeClip() {
  mkdirSync(CLIPS, { recursive: true });
  const aiff = join(CLIPS, 'call_line.aiff'), out = join(CLIPS, 'call_line.wav');
  execFileSync('say', ['-v', 'Samantha', '-o', aiff, '--', LINE]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-t', '6', '-i', 'anullsrc=r=16000:cl=mono', '-i', aiff,
    '-filter_complex', '[1:a]aresample=16000,aformat=channel_layouts=mono[s];[0:a][s]concat=n=2:v=0:a=1[a]', '-map', '[a]', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', out]);
  return out;
}

test('screens: overlay-bar + live-suggestions over a speaker-view call', async () => {
  test.setTimeout(15 * 60_000);
  mkdirSync(SHOTS, { recursive: true }); mkdirSync(CMP, { recursive: true });
  const log = logTo(`call_screens_try${TRY}.log`);
  const clip = makeClip();
  log('clip', clip, '| line:', LINE, '| 6 s leading silence');
  let glint, ctl;
  const out = { try: TRY, attempts: [] };
  try {
    glint = await launchGlint({ dataDir: 'data-call', log,
      settings: { hideFromScreenShare: false, attachScreenshotByDefault: true, answerModel: 'deepseek-v4-pro', liveModel: 'deepseek-flash' },
      env: { GLINT_AUDIO_FILE_PACE: 'realtime', GLINT_WHISPER_PREWARM: '1' } });
    const { app, overlay } = glint;
    ctl = await launchControl();
    const disp = await display(app);
    const wa = disp.workArea;
    await openWin(ctl, 'speaker', { x: wa.x, y: wa.y, width: wa.width, height: wa.height, html: SPEAKER, floating: true }); // try 2 was covered by the user's own app window
    await waitFor(async () => unwrap(await overlay.evaluate(() => window.glint.ext.invoke('audio:getStats'))).worker.state === 'ready', { timeout: 120_000, label: 'whisper ready' });
    await overlay.evaluate(() => {
      const c = (window.__c = { segs: 0, ins: 0, segAt: 0, insAt: 0, status: [] });
      window.glint.session.onSegment(() => { c.segs++; c.segAt ||= Date.now(); });
      // Count only insights with content: an empty insights event arrives at session start (seen in try 1).
      c.insLog = [];
      window.glint.session.onInsights((i) => {
        const real = !!(i.summaryMarkdown?.trim() || i.actionItems?.length);
        c.insLog.push({ at: Date.now(), real, summaryChars: (i.summaryMarkdown ?? '').length, actions: i.actionItems?.length ?? 0 });
        if (real) { c.ins++; c.insAt ||= Date.now(); }
      });
      window.glint.session.onStatus((s) => c.status.push(s.state));
    });
    const st0 = await winState(overlay);
    log('overlay default position', st0.bounds, 'protection', st0.contentProtection);
    expect(st0.contentProtection).toBe(false);

    let barDone = false, insDone = false;
    for (let attempt = 1; attempt <= 3 && !(barDone && insDone); attempt++) {
      const a = { attempt };
      await overlay.evaluate(() => Object.assign(window.__c, { segs: 0, ins: 0, segAt: 0, insAt: 0, insLog: [] }));
      await focusWin(ctl, 'speaker');
      const s = unwrap(await overlay.evaluate((f) => window.glint.session.start({ audioFile: f }), clip));
      a.sessionId = s.sessionId;
      await waitFor(() => overlay.evaluate(() => !document.querySelector('#insights').hidden && !document.querySelector('#stop').hidden), { label: 'recording + panel' });
      if (!barDone) {
        await waitFor(() => overlay.evaluate(() => document.querySelector('#status').hidden), { timeout: 6000, label: 'status strip gone' }).catch(() => {});
        const st = await winState(overlay);
        const bar = await elementScreenRect(overlay, '#bar', st.bounds);
        const w = Math.round(bar.width / 0.40), h = Math.round(w * 9 / 16);
        const r = { x: Math.round(bar.x + bar.width / 2 - w / 2), y: 0, width: w, height: h };
        const pre = await overlay.evaluate(() => ({ segs: window.__c.segs, idle: document.querySelector('#ins-summary').classList.contains('idle'), actions: document.querySelectorAll('#ins-actions .ins-act').length }));
        region(join(SHOTS, 'overlay-bar.png'), r);
        const post = await overlay.evaluate(() => ({ segs: window.__c.segs, idle: document.querySelector('#ins-summary').classList.contains('idle') }));
        a.overlayBar = { bar, region: r, ratio: +(bar.width / w).toFixed(3), pre, post };
        barDone = pre.segs === 0 && post.segs === 0 && pre.idle && post.idle && pre.actions === 0;
        log('overlay-bar attempt', attempt, a.overlayBar, 'ok=', barDone);
      }
      if (!insDone) {
        await waitFor(() => overlay.evaluate(() => window.__c.segs >= 1), { timeout: 120_000, every: 40, label: 'first segment' });
        await sleep(120); // let the panel render the segment-driven Actions list
        const st = await winState(overlay);
        const bar = await elementScreenRect(overlay, '#bar', st.bounds);
        const w = Math.round(bar.width / 0.45), h = Math.round(w * 9 / 16);
        const r = { x: Math.round(bar.x + bar.width / 2 - w / 2), y: wa.y, width: w, height: h };
        const pre = await overlay.evaluate(() => ({ ins: window.__c.ins, idle: document.querySelector('#ins-summary').classList.contains('idle'), actions: [...document.querySelectorAll('#ins-actions .ins-act')].map((b) => b.innerText.trim()), panelBottom: document.querySelector('#insights').getBoundingClientRect().bottom }));
        region(join(SHOTS, 'live-suggestions.png'), r);
        const post = await overlay.evaluate(() => ({ ins: window.__c.ins, msAfterSeg: Date.now() - window.__c.segAt, idle: document.querySelector('#ins-summary').classList.contains('idle'), actions: document.querySelectorAll('#ins-actions .ins-act').length }));
        a.liveSuggestions = { bar, region: r, ratio: +(bar.width / w).toFixed(3), pre, post, panelFits: st.bounds.y + pre.panelBottom <= r.y + r.height };
        insDone = pre.ins === 0 && post.ins === 0 && pre.idle && post.idle && pre.actions.length >= 1 && post.actions === pre.actions.length;
        log('live-suggestions attempt', attempt, a.liveSuggestions, 'ok=', insDone);
      }
      await waitFor(() => overlay.evaluate(() => window.__c.ins >= 1), { timeout: 60_000, label: 'first insights (for the record)' }).catch(() => {});
      a.firstInsightsMsAfterSegment = await overlay.evaluate(() => (window.__c.insAt && window.__c.segAt ? window.__c.insAt - window.__c.segAt : null));
      a.insightEvents = await overlay.evaluate(() => window.__c.insLog.map((e) => ({ ...e, msAfterFirstSeg: window.__c.segAt ? e.at - window.__c.segAt : null })));
      log('insight events', a.insightEvents);
      unwrap(await overlay.evaluate(() => window.glint.session.stop()));
      await waitFor(() => overlay.evaluate((id) => window.__c.status.includes('saved') || window.__c.status.includes('error'), a.sessionId), { timeout: 120_000, label: 'saved' }).catch(() => {});
      await overlay.evaluate(() => (window.__c.status = []));
      out.attempts.push(a);
      log('attempt', attempt, 'first insights arrived', a.firstInsightsMsAfterSegment, 'ms after the first segment');
      await sleep(1000);
    }
    out.overlayBarOk = barDone; out.liveSuggestionsOk = insDone;
    for (const s of ['overlay-bar', 'live-suggestions'])
      out[s] = img('sidebyside', join(ROOT, 'research/screens', `${s}.png`), join(SHOTS, `${s}.png`), join(CMP, `${s}.png`), '--height', 900).out;
    log('compare', out['overlay-bar'], out['live-suggestions']);
    expect(barDone && insDone).toBe(true);
  } finally {
    record(`screens_call_try${TRY}`, { note: 'not a gate; protection OFF; D-C9', measured: out });
    await quit(ctl);
    await quit(glint?.app);
  }
});

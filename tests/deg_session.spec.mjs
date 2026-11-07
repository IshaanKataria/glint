// Verification (d) transcription WER, (e) live suggestions in the overlay DOM, (g) notes on disk + dashboard history.
// One real session: a `say` clip fed through GLINT_AUDIO_FILE -> chunker -> WhisperX -> insights -> notes.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launchGlint, waitWindow, waitFor, wer, quit, logTo, record, sleep, OUT, ROOT } from './helpers.mjs';

const CLIP_TEXT = 'Good morning everyone, and thanks for joining. We finished the security review last week and the final report is ready. ' +
  'Our team of twelve engineers can start the database migration on Monday. Could you send the signed contract to our legal team by Friday? ' +
  'And what is the delivery date for the mobile app?';
const CLIP_WORDS = /contract|legal|friday|delivery|mobile|migration|security|review|engineer|monday|database|report/i;

test('d+e+g: transcription, live suggestions, notes + history', async () => {
  const log = logTo('deg_session.log');
  const clip = join(OUT, 'clip_deg.wav');
  const spoken = execFileSync(join(ROOT, 'scripts/make_test_clip.sh'), [clip, CLIP_TEXT], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n')[0];
  log('clip', clip, '| spoken text:', spoken);
  let glint;
  const rd = {}, re = {}, rg = {};
  try {
    glint = await launchGlint({ dataDir: 'data-deg', log, env: { GLINT_AUDIO_FILE: clip } });
    const { app, overlay, dir } = glint;
    await overlay.evaluate(() => {
      const c = (window.__chk = { segs: [], status: [], insights: [], fileDone: null });
      window.glint.session.onSegment((s) => c.segs.push({ ...s, at: Date.now() }));
      window.glint.session.onStatus((s) => c.status.push({ ...s, at: Date.now() }));
      window.glint.session.onInsights((i) => c.insights.push({ ...i, at: Date.now() }));
      window.glint.ext.on('audio:fileDone', (d) => (c.fileDone = { ...d, at: Date.now() }));
    });
    // Start the session the way a user does: the listen button in the bar.
    const t0 = Date.now();
    await overlay.click('#listen');
    const fd = await waitFor(() => overlay.evaluate(() => window.__chk.fileDone), { timeout: 180_000, label: 'audio:fileDone' });
    const chk = await overlay.evaluate(() => window.__chk);
    const sessionId = chk.segs[0]?.sessionId ?? chk.status.find((s) => s.sessionId)?.sessionId;
    const transcript = chk.segs.map((s) => s.text).join(' ');
    const lastSegAt = Math.max(...chk.segs.map((s) => s.at));
    log('statuses', chk.status.map((s) => `${s.state}${s.source ? '/' + s.source : ''}${s.message ? ' (' + s.message + ')' : ''}`));
    log('segments', chk.segs.map((s) => `${s.speaker} [${s.tStart.toFixed(2)}-${s.tEnd.toFixed(2)}] ${s.text}`));
    log('fileDone', fd, 'first segment after', chk.segs[0] ? chk.segs[0].at - t0 : null, 'ms');

    // (d) WER
    const w = wer(spoken, transcript);
    log('(d) WER', w);
    Object.assign(rd, { sessionId, reference: spoken, hypothesis: transcript, normRef: w.ref, normHyp: w.hyp, wer: w.wer, edits: w.edits, refWords: w.refWords, segments: chk.segs.length, source: chk.status.find((s) => s.source)?.source });
    rd.status = chk.segs.length > 0 && rd.source === 'file' && w.wer <= 0.10 ? 'PASS' : 'FAIL';

    // (e) live suggestions in the overlay DOM within 60 s of the last segment
    const FILLER = 'Suggest follow-up questions';
    let dom;
    try {
      dom = await waitFor(async () => {
        const d = await overlay.evaluate(() => ({
          panelVisible: !document.querySelector('#insights').hidden,
          summaryIdle: document.querySelector('#ins-summary').classList.contains('idle'),
          summaryText: document.querySelector('#ins-summary').innerText.trim(),
          actions: [...document.querySelectorAll('#ins-actions .ins-act')].map((b) => b.innerText.trim()),
        }));
        const real = d.actions.filter((a) => !a.endsWith('Suggest follow-up questions'));
        return d.panelVisible && !d.summaryIdle && d.summaryText && real.length >= 1 ? { ...d, real, at: Date.now() } : null;
      }, { timeout: Math.max(1000, lastSegAt + 60_000 - Date.now()), label: 'live insights in DOM' });
    } catch (e) {
      dom = { error: e.message, ...(await overlay.evaluate(() => ({ summaryText: document.querySelector('#ins-summary').innerText, actions: [...document.querySelectorAll('#ins-actions .ins-act')].map((b) => b.innerText) }))) };
    }
    await overlay.screenshot({ path: join(OUT, 'e_live_insights_overlay.png') });
    const ins = await overlay.evaluate(() => window.__chk.insights);
    log('(e) insights events', ins.length, 'last:', ins.at(-1));
    log('(e) DOM', dom);
    const derived = (dom.real ?? []).filter((a) => CLIP_WORDS.test(a));
    Object.assign(re, { secondsAfterLastSegment: dom.at ? (dom.at - lastSegAt) / 1000 : null, summaryText: dom.summaryText, actionsInDom: dom.actions, actionsFromInsights: dom.real, actionsDerivedFromClip: derived, insightsEvents: ins.length, model: ins.at(-1)?.model, error: dom.error });
    re.status = dom.at && dom.at - lastSegAt <= 60_000 && derived.length >= 1 ? 'PASS' : 'FAIL';

    // (g) stop -> notes on disk -> dashboard history shows the title
    await overlay.click('#stop');
    const saved = await waitFor(() => overlay.evaluate((id) => window.__chk.status.find((s) => s.sessionId === id && (s.state === 'saved' || s.state === 'error')), sessionId), { timeout: 180_000, label: 'session saved' });
    log('(g) final status', saved);
    const sdir = join(dir, sessionId);
    const sj = join(sdir, 'session.json'), nm = join(sdir, 'notes.md');
    const json = existsSync(sj) ? JSON.parse(readFileSync(sj, 'utf8')) : null;
    const notes = existsSync(nm) ? readFileSync(nm, 'utf8') : '';
    const segs = json?.segments ?? json?.transcript ?? [];
    const summary = json?.summaryMarkdown ?? json?.summary ?? '';
    const items = json?.actionItems ?? [];
    log('(g) session.json keys', json && Object.keys(json), '| title:', json?.title, '| segments', segs.length, '| summary chars', summary.length, '| actionItems', items);
    log('(g) notes.md head:\n' + notes.slice(0, 1500));
    await overlay.evaluate((id) => window.glint.app.openDashboard({ view: 'history', sessionId: id }), sessionId);
    const dash = await waitWindow(app, 'dashboard.html');
    await dash.waitForLoadState('domcontentloaded');
    let listHasTitle = false, listText = '';
    try {
      await waitFor(async () => { listText = await dash.locator('#history-list').innerText(); return json?.title && listText.includes(json.title); }, { timeout: 20_000, label: 'title in history list' });
      listHasTitle = true;
    } catch {}
    await sleep(800);
    await dash.screenshot({ path: join(OUT, 'g_dashboard_history.png') });
    const noteText = await dash.locator('#note').innerText().catch(() => '');
    log('(g) history list text:', listText, '| note pane head:', noteText.slice(0, 400));
    Object.assign(rg, { sessionId, sessionJson: existsSync(sj), notesMd: existsSync(nm), title: json?.title, transcriptSegments: segs.length, summaryChars: summary.length, actionItems: items, notesHasSections: ['Summary', 'Action items', 'Transcript'].map((h) => notes.includes(h)), historyListShowsTitle: listHasTitle, finalState: saved.state });
    rg.status = rg.sessionJson && rg.notesMd && segs.length > 0 && summary.trim() && items.length >= 1 && listHasTitle ? 'PASS' : 'FAIL';
    writeFileSync(join(OUT, 'g_session.json.copy.json'), JSON.stringify(json, null, 2));
    writeFileSync(join(OUT, 'g_notes.md.copy.md'), notes);
  } finally {
    record('d_transcription', { status: rd.status ?? 'FAIL', threshold: 'say clip through the session pipeline (GLINT_AUDIO_FILE); WER <= 10% after normalisation (lowercase, no punctuation, numbers as words)', measured: rd, evidence: ['test-output/checker/deg_session.log', 'test-output/checker/clip_deg.wav'] });
    record('e_live_suggestions', { status: re.status ?? 'FAIL', threshold: 'within 60 s of the last segment, overlay DOM shows non-empty Live Insights summary and >=1 action item derived from the clip', measured: re, evidence: ['test-output/checker/deg_session.log', 'test-output/checker/e_live_insights_overlay.png'] });
    record('g_notes', { status: rg.status ?? 'FAIL', threshold: 'after stop, session.json and notes.md exist with non-empty transcript, summary and >=1 action item; dashboard history list shows the session title', measured: rg, evidence: ['test-output/checker/deg_session.log', 'test-output/checker/g_dashboard_history.png', 'test-output/checker/g_session.json.copy.json', 'test-output/checker/g_notes.md.copy.md'] });
    await quit(glint?.app);
  }
  expect.soft(rd.status, JSON.stringify(rd)).toBe('PASS');
  expect.soft(re.status, JSON.stringify(re)).toBe('PASS');
  expect(rg.status, JSON.stringify(rg)).toBe('PASS');
});

// AI agent smoke test (real DeepSeek calls, real screen capture + Vision OCR, real disk writes).
// Launches Glint with GLINT_TEST=1 via Playwright's Electron driver and checks:
//   (a) a typed ask (no screenshot) streams a deepseek-v4-pro answer; a follow-up uses the thread; cancel + clear work
//   (b) a test window with known text is OCR'd and the answer contains the code
//   (c) synthetic transcript segments -> session:insights from deepseek-flash; stop -> session.json + notes.md
//   (d) history:list / history:get return the saved session
// Run: node scripts/build.mjs && node scripts/ai_smoke.mjs [--skip-ocr]
// Never prints the API key; ends with a leak scan of logs and written files.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'test-output');
const dataDir = join(outDir, 'ai-smoke-data');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
const shotPath = join(outDir, 'ai-smoke-screen.png');
const skipOcr = process.argv.includes('--skip-ocr');

const mainLogs = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, timeout = 90_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, GLINT_TEST: '1', GLINT_DATA_DIR: dataDir, GLINT_KEEP_SCREENSHOT: shotPath },
  timeout: 30_000,
});
app.process().stdout?.on('data', (d) => mainLogs.push(...String(d).trim().split('\n')));
app.process().stderr?.on('data', (d) => mainLogs.push(...String(d).trim().split('\n').map((l) => `stderr: ${l}`)));

let exitCode = 0;
try {
  const overlay = await app.firstWindow();
  await overlay.waitForFunction(() => !!window.glint, null, { timeout: 20_000 });

  // Collect every ask/session event the overlay renderer receives.
  await overlay.evaluate(() => {
    const w = window;
    w.__ai = { status: [], chunks: {}, done: {}, errors: {}, insights: [], cleared: 0 };
    w.glint.ask.onStatus((e) => w.__ai.status.push(e));
    w.glint.ask.onChunk((e) => ((w.__ai.chunks[e.requestId] ??= []).push(e.delta)));
    w.glint.ask.onDone((e) => (w.__ai.done[e.requestId] = e));
    w.glint.ask.onError((e) => (w.__ai.errors[e.requestId] = e.error));
    w.glint.ask.onCleared(() => w.__ai.cleared++);
    w.glint.session.onInsights((e) => w.__ai.insights.push(e));
  });
  const ask = (question, options) => overlay.evaluate(([q, o]) => window.glint.ask.ask(q, o), [question, options]);
  const quick = (kind, options) => overlay.evaluate(([k, o]) => window.glint.ask.quick(k, o), [kind, options]);
  const result = (id) =>
    waitFor(
      () => overlay.evaluate((rid) => window.__ai.done[rid] ?? (window.__ai.errors[rid] ? { error: window.__ai.errors[rid] } : null), id),
      `answer ${id}`,
      120_000,
    );
  const statusesFor = (id) => overlay.evaluate((rid) => window.__ai.status.filter((s) => s.requestId === rid).map((s) => s.stage), id);
  const chunkCount = (id) => overlay.evaluate((rid) => (window.__ai.chunks[rid] ?? []).length, id);

  // ---------- (a) typed question, no screenshot ----------
  console.log('\n=== (a) typed ask, withScreenshot:false ===');
  let t = Date.now();
  const a1 = await ask('What is 17 times 23? Reply in one short sentence.', { withScreenshot: false, source: 'input' });
  console.log('ask:ask ->', JSON.stringify(a1));
  const d1 = await result(a1.value.requestId);
  if (d1.error) throw new Error('ask failed: ' + JSON.stringify(d1.error));
  console.log(`answer (${Date.now() - t} ms, ${await chunkCount(a1.value.requestId)} chunks):`, JSON.stringify(d1.answer));
  console.log('meta:', JSON.stringify(d1.meta));
  console.log('stages:', (await statusesFor(a1.value.requestId)).join(' > '));
  check('(a) answer streamed in >1 chunk', (await chunkCount(a1.value.requestId)) > 1);
  check('(a) model is deepseek-v4-pro', d1.meta.model === 'deepseek-v4-pro', d1.meta.model);
  check('(a) answer contains 391', d1.answer.includes('391'));
  check('(a) usedScreenshot false, ocrChars 0', d1.meta.usedScreenshot === false && d1.meta.ocrChars === 0);

  console.log('\n=== (a2) follow-up in the same thread (F05) ===');
  const a2 = await ask('Now double that number. Just the number.', { withScreenshot: false });
  const d2 = await result(a2.value.requestId);
  console.log('follow-up answer:', JSON.stringify(d2.answer ?? d2.error));
  check('(a2) follow-up uses the thread (782)', d2.answer?.includes('782'));

  console.log('\n=== (a3) cancel and clear ===');
  const a3 = await ask('Write a 400-word essay about the history of tea.', { withScreenshot: false });
  await sleep(400);
  await overlay.evaluate((rid) => window.glint.ask.cancel(rid), a3.value.requestId);
  const d3 = await result(a3.value.requestId);
  console.log('after cancel:', JSON.stringify(d3.error ?? 'done?!'));
  check('(a3) cancel -> ask:error CANCELLED', d3.error?.code === 'CANCELLED');
  await overlay.evaluate(() => window.glint.ask.clear());
  const threadAfterClear = await app.evaluate(() => globalThis.__glintAiTest.threadLength());
  const cleared = await overlay.evaluate(() => window.__ai.cleared);
  check('(a3) ask:clear empties thread and emits ask:cleared', threadAfterClear === 0 && cleared >= 1, `thread=${threadAfterClear} cleared=${cleared}`);

  // ---------- (b) screenshot -> OCR -> answer ----------
  if (!skipOcr) {
    console.log('\n=== (b) screen question with OCR ===');
    const runCode = String(Math.floor(100000 + Math.random() * 900000));
    await app.evaluate(({ BrowserWindow, screen }, code) => {
      const d = screen.getPrimaryDisplay().workArea;
      // Bottom-left of the screen, clear of the centred system dialogs macOS may show.
      const w = new BrowserWindow({ x: d.x + 40, y: d.y + d.height - 300, width: 900, height: 240, show: false, alwaysOnTop: true, title: 'OCR test' });
      w.setAlwaysOnTop(true, 'floating');
      const html = `<html><body style="margin:0;background:#fff;font:600 28px -apple-system,Helvetica;padding:36px;color:#111">GLINT-OCR-TEST: The secret pineapple code is 4471<div style="font:400 18px Menlo;color:#444;margin-top:22px">run marker ${code} · invoice ref zq9-Kx · do not share</div></body></html>`;
      w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      w.once('ready-to-show', () => w.showInactive());
      globalThis.__ocrWin = w;
    }, runCode);
    await sleep(1500);
    const shot = await app.evaluate(() => globalThis.__glintAiTest.ocrScreen());
    console.log(`direct OCR: screen permission=${shot.permission} engine=${shot.engine} ${shot.width}x${shot.height} capture=${shot.captureMs} ms ocr=${shot.ms} ms chars=${shot.chars}`);
    const hit = shot.text.split('\n').filter((l) => l.includes('4471') || l.includes(runCode));
    console.log('OCR lines with the markers:', JSON.stringify(hit));
    check('(b) OCR text contains 4471', shot.text.includes('4471'));
    check(`(b) OCR text contains this run's marker ${runCode} (text came from the test window)`, shot.text.includes(runCode));
    const ov = await overlay.evaluate(() => window.glint.test.getWindowState('overlay'));
    console.log('overlay window during capture:', JSON.stringify({ visible: ov.value?.visible, contentProtection: ov.value?.contentProtection, bounds: ov.value?.bounds }));
    t = Date.now();
    const b1 = await ask('What is the secret code on my screen?', { withScreenshot: true, source: 'input' });
    const db = await result(b1.value.requestId);
    if (db.error) console.log('ERROR:', JSON.stringify(db.error));
    console.log(`answer (${Date.now() - t} ms):`, JSON.stringify(db.answer));
    console.log('meta:', JSON.stringify(db.meta));
    console.log('stages:', (await statusesFor(b1.value.requestId)).join(' > '));
    check('(b) usedScreenshot true and ocrChars > 0', db.meta?.usedScreenshot && db.meta.ocrChars > 0, `ocrChars=${db.meta?.ocrChars}`);
    check('(b) answer contains 4471', db.answer?.includes('4471'));
    const stages = await statusesFor(b1.value.requestId);
    check('(b) stages capturing > ocr > thinking > streaming', ['capturing', 'ocr', 'thinking', 'streaming'].every((s, i) => stages[i] === s), stages.join(','));
    // Glint's overlay is content-protected; its bar text should not be in the capture.
    const overlayText = ['Show/Hide', 'Ask about your screen'].filter((s) => shot.text.includes(s));
    console.log('overlay strings found in capture:', JSON.stringify(overlayText), '(content protection: expect none)');
    await app.evaluate(() => globalThis.__ocrWin?.destroy());
    await overlay.evaluate(() => window.glint.ask.clear());
  }

  // ---------- (c) live insights + session save ----------
  console.log('\n=== (c) synthetic transcript -> live insights -> saved notes ===');
  const sessionId = `ai-smoke-${Date.now()}`;
  const startedAt = Date.now() - 95_000;
  const lines = [
    ['them', 'Thanks for joining. So we are evaluating Glint for our support team of about forty agents.'],
    ['me', 'Great to meet you, Priya. What tools are the agents using today?'],
    ['them', 'Mostly Zendesk, and we built an internal RAG pipeline on top of our knowledge base last year.'],
    ['them', 'Our biggest worry is SOC 2 compliance. Does your product store any call audio in the cloud?'],
    ['me', 'No, transcription runs locally with WhisperX, so audio never leaves the laptop.'],
    ['them', 'Okay. And what would pricing look like for forty seats on an annual plan?'],
    ['me', 'I will send over a quote by Friday with the annual discount included.'],
    ['them', 'Perfect. I also need to loop in Marcus from security before we sign anything.'],
    ['me', 'Sounds good. I can set up a thirty minute security review with Marcus next week.'],
  ];
  await app.evaluate((_e, p) => globalThis.__glintAiTest.busEmit('session:started', p), { sessionId, startedAt, resumed: false, source: 'file' });
  let tt = 0;
  for (const [i, [speaker, text]] of lines.entries()) {
    const seg = { sessionId, id: `seg-${i}`, speaker, text, tStart: tt, tEnd: tt + 8 };
    tt += 9;
    await app.evaluate((_e, s) => globalThis.__glintAiTest.busEmit('transcript:segment', s), seg);
    await sleep(350);
  }
  t = Date.now();
  const ins = await waitFor(
    () => overlay.evaluate((sid) => window.__ai.insights.filter((x) => x.sessionId === sid && x.summaryMarkdown).at(-1), sessionId),
    'session:insights with a summary',
    60_000,
  );
  console.log(`session:insights received in the overlay (${Date.now() - t} ms after last segment), model=${ins.model}`);
  console.log('summaryMarkdown:\n' + ins.summaryMarkdown);
  console.log('actionItems:', JSON.stringify(ins.actionItems, null, 1));
  check('(c) insights from deepseek-flash', ins.model === 'deepseek-flash', ins.model);
  check('(c) summary has a bold heading and bullets', /\*\*[^*]+\*\*/.test(ins.summaryMarkdown) && /^\s*- /m.test(ins.summaryMarkdown));
  check('(c) at least one detected question', ins.actionItems.some((a) => a.kind === 'question'));

  // Click an action item: ask through ask:ask with source 'insight'.
  const item = ins.actionItems.find((a) => a.kind === 'question') ?? ins.actionItems[0];
  const c1 = await ask(item.text, { source: 'insight', insightId: item.id, withScreenshot: false });
  const dc = await result(c1.value.requestId);
  console.log(`insight click "${item.text}" -> pill "${dc.meta?.question}":`, JSON.stringify((dc.answer ?? JSON.stringify(dc.error)).slice(0, 300)));
  check('(c) insight click answered with the transcript', !!dc.answer && dc.meta.sessionId === sessionId);
  const q = await quick('whatShouldISay', { withScreenshot: false });
  const dq = await result(q.value.requestId);
  console.log('quick whatShouldISay:', JSON.stringify((dq.answer ?? JSON.stringify(dq.error)).slice(0, 400)));
  check('(c) quick action answered, pill label', dq.meta?.question === 'What should I say?' && !!dq.answer);

  t = Date.now();
  await app.evaluate((_e, p) => globalThis.__glintAiTest.busEmit('session:stopped', p), { sessionId, endedAt: Date.now() });
  await app.evaluate(() => globalThis.__glintSessionsTest.idle());
  console.log(`notes written ${Date.now() - t} ms after session:stopped`);
  const dir = join(dataDir, sessionId);
  console.log('files:', readdirSync(dir).join(', '));
  const sj = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  console.log('session.json:', JSON.stringify({ ...sj, transcript: `[${sj.transcript.length} segments]`, usage: sj.usage.map((u) => `${u.kind}: ${u.question}`) }, null, 1));
  const notes = readFileSync(join(dir, 'notes.md'), 'utf8');
  console.log('notes.md (first 40 lines):\n' + notes.split('\n').slice(0, 40).join('\n'));
  check('(c) session.json has title, summary, action items', sj.title && !sj.title.startsWith('Session ') && sj.summaryMarkdown && sj.actionItems.length > 0);
  const secs = (sj.summaryMarkdown.match(/^### .+\n- /gm) ?? []).length;
  check('(c) notes summary is sectioned: >= 2 "### Heading" + bullets, figures kept (40, Friday)', secs >= 2 && sj.summaryMarkdown.includes('40') && /Friday/.test(sj.summaryMarkdown + sj.actionItems.join(' ')), `${secs} sections`);
  check('(c) session.json has transcript[9], durationSec, 2 usage entries', sj.transcript.length === 9 && sj.durationSec > 0 && sj.usage.length === 2);
  check('(c) notes.md has Summary, Action items, Transcript', ['## Summary', '## Action items', '## Transcript'].every((h) => notes.includes(h)));

  // ---------- (d) history ----------
  console.log('\n=== (d) history ===');
  const list = await overlay.evaluate(() => window.glint.history.list());
  console.log('history:list ->', JSON.stringify(list));
  check('(d) history:list returns the session first', list.ok && list.value[0]?.id === sessionId && list.value[0].hasSummary && list.value[0].uses === 2);
  const got = await overlay.evaluate((id) => window.glint.history.get(id), sessionId);
  check('(d) history:get returns segments + summary', got.ok && got.value.segments.length === 9 && !!got.value.summaryMarkdown, got.ok ? `title="${got.value.title}"` : JSON.stringify(got.error));
  const cp = await overlay.evaluate((id) => window.glint.history.copyTranscript(id), sessionId);
  check('(d) history:copyTranscript', cp.ok && cp.value.chars > 100, JSON.stringify(cp));
  const missing = await overlay.evaluate(() => window.glint.history.get('nope'));
  check('(d) history:get unknown id -> NOT_FOUND', !missing.ok && missing.error.code === 'NOT_FOUND');
} catch (err) {
  console.error('SMOKE ERROR:', err.message);
  exitCode = 1;
} finally {
  await app.close().catch(() => {});
}

// Main-process log lines from the AI, OCR and sessions modules.
console.log('\n=== main-process log (ai/ocr/sessions) ===');
for (const l of mainLogs.filter((l) => /glint:(ai|ocr|sessions)\]/.test(l))) console.log(l);

// Leak scan: the key must not appear in logs or in any written file. The key is compared, never printed.
let key = process.env.DEEPSEEK_API_KEY;
try {
  key ||= execFileSync('fish', ['-c', 'printf %s "$DEEPSEEK_API_KEY"'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {}
if (key) {
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name))));
  walk(dataDir);
  const leaks = files.filter((f) => readFileSync(f, 'utf8').includes(key)).length + mainLogs.filter((l) => l.includes(key)).length;
  check(`key leak scan (${files.length} files, ${mainLogs.length} log lines)`, leaks === 0, `${leaks} hits`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (existsSync(shotPath)) console.log('capture kept at', shotPath);
writeFileSync(join(outDir, 'ai-smoke-checks.json'), JSON.stringify(checks, null, 1));
process.exit(failed.length || exitCode ? 1 : 0);

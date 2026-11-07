// Audio smoke test (Audio + transcription agent). Launches Glint through Playwright's Electron
// driver with GLINT_TEST=1 and a file audio source, starts a session through the real preload API,
// collects session:segment / session:status / audio:fileDone events in the overlay, stops the
// session, and compares the transcript with the spoken text after normalisation.
//
// Usage:
//   node scripts/audio_smoke.mjs                       # makes a `say` clip, file-source test
//   node scripts/audio_smoke.mjs --clip a.wav --text "what was said"
//   node scripts/audio_smoke.mjs --live 8              # live capture (mic + system) for 8 s, no file
//   node scripts/audio_smoke.mjs --live 10 --say "testing the glint microphone" [--say-at 4] [--say-device 74] [--no-system]
//     plays the phrase with `say -a <device>` (74 = MacBook Air Speakers) during a live run; with system
//     audio on, the speakers' sound is captured as 'them' and the mic copy must be flagged as echo;
//     with --no-system (GLINT_SYSTEM_AUDIO=0) the mic copy must come out as a 'me' segment.
//   --dump DIR: GLINT_AUDIO_DUMP_DIR, raw per-source PCM for level analysis
// Options: --data-dir DIR (default test-output/audio-smoke/data), --max-wer 0.15, --no-build,
//   --runs N (file sessions in one app launch; run 2+ is warm-model latency, default 2),
//   --resume (run 2+ resumes run 1's session: times must continue after run 1, ids stay unique),
//   --kill-worker (SIGKILL the WhisperX worker after the first segment of run 1; checks restart + retry)
// Run `npm run build` first (or drop --no-build to let this script build). Exit 1 on failure.
import { _electron as electron } from '@playwright/test';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
if (argv.includes('-h') || argv.includes('--help')) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(0, 12).join('\n'));
  process.exit(0);
}
const live = opt('live');
const sayText = opt('say');
const sayAt = Number(opt('say-at', '4'));
const sayDevice = opt('say-device', '74');
const noSystem = argv.includes('--no-system');
let sayWall = 0;
const outDir = join(root, 'test-output', 'audio-smoke');
const dataDir = resolve(opt('data-dir', join(outDir, live ? 'data-live' : 'data')));
const maxWer = Number(opt('max-wer', '0.15'));
const runs = live ? 1 : Number(opt('runs', '2'));
const killWorker = argv.includes('--kill-worker');
const resumeRuns = argv.includes('--resume');
let firstSessionId;
let firstSegs = [];
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

if (!argv.includes('--no-build')) execFileSync('node', [join(root, 'scripts/build.mjs')], { stdio: 'ignore' });

let clip = opt('clip');
let expected = opt('text');
if (!live && !clip) {
  clip = join(outDir, 'clip.wav');
  expected = execFileSync(join(root, 'scripts/make_test_clip.sh'), [clip], { encoding: 'utf8' }).trim().split('\n')[0];
}
if (!live) console.log(`clip: ${clip}\nspoken: ${expected}`);

const env = { ...process.env, GLINT_TEST: '1', GLINT_DATA_DIR: dataDir };
delete env.GLINT_AUDIO_FILE;
if (!live) env.GLINT_AUDIO_FILE = clip;
if (noSystem) env.GLINT_SYSTEM_AUDIO = '0';
if (opt('dump')) env.GLINT_AUDIO_DUMP_DIR = resolve(opt('dump'));

const t0 = Date.now();
const ms = () => `${String(Date.now() - t0).padStart(6)} ms`;
const mainLog = [];
const app = await electron.launch({ args: [root], cwd: root, env, timeout: 30000 });
app.process().stdout?.on('data', (d) => mainLog.push(...String(d).trim().split('\n')));
app.process().stderr?.on('data', (d) => mainLog.push(...String(d).trim().split('\n').map((l) => `stderr: ${l}`)));

async function waitFor(fn, what, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeout} ms waiting for ${what}`);
}

let failed = false;
try {
  const overlay = await app.firstWindow();
  await overlay.waitForFunction(() => !!window.glint, null, { timeout: 15000 });
  await overlay.evaluate(() => {
    const ev = (window.__audioEvents = []);
    const t = () => Date.now();
    window.glint.session.onStatus((s) => ev.push({ at: t(), type: 'status', s }));
    window.glint.session.onSegment((s) => ev.push({ at: t(), type: 'segment', s }));
    window.glint.ext.on('audio:fileDone', (s) => ev.push({ at: t(), type: 'fileDone', s }));
  });
  for (let run = 1; run <= runs; run++) {
  console.log(`\n===== run ${run}/${runs} =====`);
  await overlay.evaluate(() => (window.__audioEvents.length = 0));
  console.log(`${ms()} calling session.start()`);
  const startReq = resumeRuns && run > 1 ? { resumeSessionId: firstSessionId } : undefined;
  if (startReq) await new Promise((r) => setTimeout(r, 3000)); // let the sessions module finish run 1's notes
  const startRes = await overlay.evaluate((req) => window.glint.session.start(req), startReq);
  console.log(`${ms()} session.start ->`, JSON.stringify(startRes));
  if (!startRes.ok) throw new Error(`start failed: ${startRes.error.code} ${startRes.error.message}`);
  const sessionId = startRes.value.sessionId;

  const events = () => overlay.evaluate(() => window.__audioEvents);
  if (live) {
    console.log(`${ms()} recording live for ${live} s...`);
    if (sayText) {
      setTimeout(() => {
        sayWall = Date.now();
        console.log(`${ms()} say -a ${sayDevice} "${sayText}" (session t=${((sayWall - startRes.value.startedAt) / 1000).toFixed(2)}s)`);
        execFile('say', ['-a', sayDevice, sayText], (err) => err && console.log('say failed:', err.message));
      }, sayAt * 1000);
    }
    await new Promise((r) => setTimeout(r, Number(live) * 1000));
  } else {
    if (killWorker && run === 1) {
      await waitFor(async () => (await events()).some((e) => e.type === 'segment'), 'first segment', 120000);
      const pid = (await overlay.evaluate(() => window.glint.ext.invoke('audio:getStats'))).value.worker.pid;
      process.kill(pid, 'SIGKILL');
      console.log(`${ms()} --kill-worker: sent SIGKILL to WhisperX worker pid ${pid}`);
    }
    await waitFor(async () => (await events()).some((e) => e.type === 'fileDone'), 'audio:fileDone', 180000);
    console.log(`${ms()} audio:fileDone received`);
    const st = await overlay.evaluate(() => window.glint.session.getStatus());
    console.log(`${ms()} status while open after file end:`, JSON.stringify(st.value));
  }
  const stopRes = await overlay.evaluate(() => window.glint.session.stop());
  console.log(`${ms()} session.stop ->`, JSON.stringify(stopRes));
  const stats = (await overlay.evaluate(() => window.glint.ext.invoke('audio:getStats'))).value;

  const ev = await events();
  console.log('\n--- events (ms after start() call) ---');
  const base = ev[0]?.at ?? 0;
  for (const e of ev) {
    const d = String(e.at - base).padStart(6);
    if (e.type === 'segment') console.log(`${d} segment  ${e.s.speaker} [${e.s.tStart}-${e.s.tEnd}s] id=${e.s.id} "${e.s.text}"`);
    else if (e.type === 'status') console.log(`${d} status   ${e.s.state}${e.s.source ? ' source=' + e.s.source : ''}${e.s.message ? ' "' + e.s.message + '"' : ''}`);
    else console.log(`${d} fileDone ${JSON.stringify(e.s)}`);
  }
  console.log('\n--- audio:getStats ---');
  console.log(`worker: ${JSON.stringify(stats.worker)}`);
  console.log(`sources: ${JSON.stringify(stats.sources)}  systemAudio: ${stats.systemAudio ?? '-'}  echoReference: ${stats.echoReference ?? '-'}`);
  console.log(`config: ${JSON.stringify(stats.config)}`);
  for (const c of stats.chunks) {
    const lv = `peak=${c.peakDb} rms=${c.rmsDb} maxFrame=${c.maxFrameDb} floor=${c.noiseFloorDb} thr=${c.voicedThresholdDb} voiced=${c.voicedSec}s`;
    const echo = c.echoUserSec !== undefined ? ` | echo: user=${c.echoUserSec}s explainedBySpeakers=${c.echoExplainedSec}s speakerVoiced=${c.refVoicedSec}s coupling=${c.couplingDb ?? '-'}dB` : '';
    const res = c.skipped ? `SKIPPED (${c.skipReason ?? 'silence'})` : `worker=${c.workerMs}ms latency=${c.latencyMs}ms chars=${c.chars}`;
    console.log(`chunk ${c.speaker} t=${c.tStart}s dur=${c.durationSec}s ${res} | ${lv}${echo}${c.error ? ' ERROR ' + c.error : ''}`);
  }

  const segs = ev.filter((e) => e.type === 'segment').map((e) => e.s);
  const transcript = segs.map((s) => s.text).join(' ');
  console.log(`\ntranscript: ${transcript || '(none)'}`);

  if (live && sayText) {
    const me = segs.filter((x) => x.speaker === 'me');
    const them = segs.filter((x) => x.speaker === 'them');
    const sayStart = (sayWall - startRes.value.startedAt) / 1000; // session clock
    const micAtSpeech = stats.chunks.filter((c) => c.speaker === 'me' && c.tStart <= sayStart + 2.5 && c.tStart + c.durationSec >= sayStart);
    console.log(`mic chunks overlapping the speech (session t=${sayStart.toFixed(2)}s): ${micAtSpeech.map((c) => `t=${c.tStart}s ${c.skipped ? 'skipped:' + c.skipReason : 'transcribed'}`).join(', ') || 'none'}`);
    const phrase = normalise(sayText);
    const werOf = (list) => (list.length ? wer(phrase, normalise(list.map((x) => x.text).join(' '))) : 1);
    console.log(`\nme segments: ${me.length} ${JSON.stringify(me.map((x) => x.text))}  WER vs phrase ${(werOf(me) * 100).toFixed(0)}%`);
    console.log(`them segments: ${them.length} ${JSON.stringify(them.map((x) => x.text))}  WER vs phrase ${(werOf(them) * 100).toFixed(0)}%`);
    const checks = [['mic chunk(s) during the speech were not gated as silence', micAtSpeech.some((c) => c.skipReason !== 'silence')]];
    if (noSystem) checks.push(['a me segment was produced from the mic', me.length > 0]);
    else {
      checks.push(['the speakers\' audio came out as them', them.length > 0]);
      checks.push(['no me segment duplicates the system audio (echo flagged)', me.length === 0 && micAtSpeech.some((c) => c.skipReason === 'echo')]);
    }
    console.log('\n--- checks (live) ---');
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
      if (!ok) failed = true;
    }
  }
  if (!live) {
    const a = normalise(expected);
    const b = normalise(transcript);
    const w = wer(a, b);
    console.log(`normalised spoken:     ${a.join(' ')}`);
    console.log(`normalised transcript: ${b.join(' ')}`);
    console.log(`WER: ${(w * 100).toFixed(1)}% (pass if <= ${(maxWer * 100).toFixed(0)}%)`);
    const checks = [
      ['session started', startRes.ok],
      ['segments received', segs.length > 0],
      ['speaker is them (file default)', segs.every((s) => s.speaker === 'them')],
      ['segments belong to session', segs.every((s) => s.sessionId === sessionId)],
      ['times increase', segs.every((s, i) => s.tEnd >= s.tStart && (i === 0 || s.tStart >= segs[i - 1].tStart))],
      ['transcript matches spoken text', w <= maxWer],
      ['ends idle after stop', stopRes.ok && stopRes.value.state === 'idle'],
    ];
    // The sessions module (AI agent) persists the segments from the bus events.
    await new Promise((r) => setTimeout(r, 2500));
    const sessDir = join(dataDir, sessionId);
    const sessFile = join(sessDir, 'session.json');
    if (existsSync(sessFile)) {
      const saved = JSON.parse(readFileSync(sessFile, 'utf8'));
      const n = (saved.transcript ?? saved.segments ?? []).length;
      console.log(`on disk: ${sessFile} has ${n} segment(s); files: ${readdirSync(sessDir).join(', ')}`);
      checks.push(['sessions store saved the segments', n === (resumeRuns && run > 1 ? firstSegs.length + segs.length : segs.length)]);
    } else console.log(`on disk: ${sessFile} not found (sessions module not writing yet?)`);
    if (run === 1) {
      firstSessionId = sessionId;
      firstSegs = segs;
    } else if (resumeRuns) {
      const lastEnd = Math.max(...firstSegs.map((x) => x.tEnd));
      checks.push(['resumed: same session id', sessionId === firstSessionId]);
      checks.push([`resumed: times continue after run 1 (first tStart ${segs[0]?.tStart} >= ${lastEnd})`, segs.length > 0 && segs[0].tStart >= lastEnd]);
      checks.push(['resumed: segment ids unique', new Set([...firstSegs, ...segs].map((x) => x.id)).size === firstSegs.length + segs.length]);
    }
    if (killWorker && run === 1) checks.push(['worker restarted after SIGKILL', stats.worker.restarts >= 1 && stats.worker.state === 'ready']);
    console.log(`\n--- checks (run ${run}) ---`);
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
      if (!ok) failed = true;
    }
  }
  }
} catch (err) {
  failed = true;
  console.log('ERROR', err.message);
} finally {
  await app.close().catch(() => {});
  const audioLines = mainLog.filter((l) => /glint:(audio|whisper)|whisper_worker/.test(l));
  console.log('\n--- main-process audio log ---');
  for (const l of audioLines) console.log(l);
}
process.exit(failed ? 1 : 0);

// ---------- normalisation + word error rate ----------
function normalise(s) {
  const t = String(s)
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/\d+/g, (n) => numberWords(Number(n)))
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'/g, '');
  return t.split(/\s+/).filter(Boolean);
}
function numberWords(n) {
  const ones = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  const tens = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
  if (n < 1e6) return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberWords(n % 1000) : '');
  return String(n);
}
function wer(ref, hyp) {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return ref.length ? d[ref.length][hyp.length] / ref.length : hyp.length ? 1 : 0;
}

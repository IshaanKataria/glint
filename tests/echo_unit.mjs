// Checker: unit test of the echo decision (src/audio/echo.ts, read-only). Bundles it with esbuild into
// test-output/checker/bin/, synthesises speaker (echo reference) and mic PCM, and checks 5 cases.
// Usage: node tests/echo_unit.mjs   (exit 1 on any failure)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const out = join(ROOT, 'test-output/checker/bin/echo.bundle.mjs');
mkdirSync(join(ROOT, 'test-output/checker/bin'), { recursive: true });
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [join(ROOT, 'src/audio/echo.ts'), '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`], { stdio: 'ignore' });
const { Envelope, envelopeOf, echoDecision, DEFAULT_ECHO } = await import(pathToFileURL(out).href);

const SR = 16000;
/** PCM of `sec` seconds with a 440 Hz tone of peak `amp` inside [on, off) seconds, silence elsewhere. */
function pcm(sec, segs) {
  const a = new Int16Array(Math.round(sec * SR));
  for (const [on, off, amp] of segs) for (let i = Math.round(on * SR); i < Math.min(a.length, Math.round(off * SR)); i++) a[i] = Math.round(amp * Math.sin((2 * Math.PI * 440 * i) / SR));
  return a;
}
const VOICED = 24; // frame-RMS thresholds, as the app's floor-relative gate gives on a quiet stream (A13: max(24, 8×floor))
const SPK = 8000; // speaker playback peak (RMS ~5657, ~75 dB)
const echoAmp = (couplingDb) => SPK * 10 ** (couplingDb / 20); // mic copy of the speakers at a given coupling

function run(name, { ref, mic, t0 = 0, coupling, expectEcho }) {
  const env = new Envelope(0);
  env.push(ref);
  const d = echoDecision(envelopeOf(mic), t0, env, VOICED, VOICED, coupling, DEFAULT_ECHO);
  const ok = d.echo === expectEcho && d.micVoicedSec > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: expect ${expectEcho ? 'echo' : 'user'} -> ${d.echo ? 'echo' : 'user'}  ${JSON.stringify(d)}`);
  return ok;
}

const results = [
  run('1 speakers silent -> user', { ref: pcm(5, []), mic: pcm(5, [[1, 2.5, 1500]]), expectEcho: false }),
  run('2 speakers playing, mic at echo level (no learned coupling) -> echo', { ref: pcm(5, [[1, 3, SPK]]), mic: pcm(5, [[1.05, 2.95, echoAmp(-30)]]), expectEcho: true }),
  run('3 learned coupling -30 dB, mic at that echo level -> echo', { ref: pcm(5, [[1, 3, SPK]]), mic: pcm(5, [[1.05, 2.95, echoAmp(-30)]]), coupling: -30, expectEcho: true }),
  run('4 mic ~40 dB above the expected echo while speakers play (double talk) -> user', { ref: pcm(5, [[1, 3, SPK]]), mic: pcm(5, [[1.2, 2.6, echoAmp(-30) * 100]]), coupling: -30, expectEcho: false }),
  run('5 speakers stopped 1.5 s before the speech -> user', { ref: pcm(5, [[0.5, 2.0, SPK]]), mic: pcm(5, [[3.5, 4.6, 1500]]), coupling: -30, expectEcho: false }),
];
const passed = results.filter(Boolean).length;
const line = `echo unit: ${passed}/${results.length} PASS (DEFAULT_ECHO ${JSON.stringify(DEFAULT_ECHO)})`;
console.log(line);
writeFileSync(join(ROOT, 'test-output/checker/echo_unit.txt'), line + '\n');
process.exit(passed === results.length ? 0 : 1);

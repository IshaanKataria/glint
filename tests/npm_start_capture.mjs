// Checker: run `npm start` (build + launch) for N seconds, capture stdout/stderr, then quit it.
// Usage: node tests/npm_start_capture.mjs [seconds] [outfile]
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const secs = Number(process.argv[2] ?? 15);
const out = process.argv[3] ?? 'test-output/checker/npm-start.txt';
const t0 = Date.now();
let buf = `$ npm start   (cwd ${process.cwd()}, started ${new Date().toISOString()})\n`;
const child = spawn('npm', ['start'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stamp = () => `[+${((Date.now() - t0) / 1000).toFixed(1)}s] `;
const add = (tag) => (d) => { for (const l of d.toString().split('\n')) if (l.trim()) buf += `${stamp()}${tag} ${l}\n`; };
child.stdout.on('data', add('out'));
child.stderr.on('data', add('err'));
let exitedEarly = null;
child.on('exit', (code, sig) => { exitedEarly ??= { code, sig, at: (Date.now() - t0) / 1000 }; });
setTimeout(() => {
  const early = exitedEarly;
  buf += `${stamp()}checker: ${early ? `process EXITED EARLY code=${early.code} sig=${early.sig} at ${early.at}s` : 'still running after ' + secs + ' s (good); sending SIGTERM to process group'}\n`;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => {
    let left = '';
    try { left = execSync(`pgrep -fl "cluely-clone/node_modules/electron" || true`).toString().trim(); } catch {}
    buf += `${stamp()}checker: leftover electron processes after quit: ${left ? left.split('\n').length : 0}\n`;
    if (left) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    writeFileSync(out, buf);
    process.stdout.write(buf);
    process.exit(0);
  }, 3000);
}, secs * 1000);

// Checker helpers: launch Glint and the control app, screen capture, OCR, image ops, result records.
import { _electron as electron } from '@playwright/test';
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';

export const ROOT = resolve(new URL('..', import.meta.url).pathname);
export const OUT = join(ROOT, 'test-output/checker');
mkdirSync(join(OUT, 'results'), { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Unambiguous uppercase/digit marker (no 0/O, 1/I/L, 5/S, 8/B, 2/Z). */
export function marker(prefix, n = 6) {
  const abc = 'ACDEFHJKMNPRTUVWXY34679';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[randomInt(abc.length)];
  return `${prefix}${s}`;
}

export function logTo(name) {
  const file = join(OUT, name);
  writeFileSync(file, `# ${name}  ${new Date().toISOString()}\n`);
  return (...a) => {
    const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    appendFileSync(file, line + '\n');
    console.log(line);
  };
}

export function record(id, data) {
  writeFileSync(join(OUT, 'results', `${id}.json`), JSON.stringify({ id, at: new Date().toISOString(), ...data }, null, 2));
}

export async function launchGlint({ dataDir, env = {}, log = console.log, settings }) {
  const dir = join(OUT, dataDir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (settings) writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings));
  const app = await electron.launch({
    args: ['.'],
    cwd: ROOT,
    env: { ...process.env, GLINT_TEST: '1', GLINT_DATA_DIR: dir, ...env },
    timeout: 60_000,
  });
  const lines = [];
  const sink = (tag) => (d) => d.toString().split('\n').filter(Boolean).forEach((l) => { lines.push(`${tag} ${l}`); log(`  [glint ${tag}] ${l}`); });
  app.process().stdout.on('data', sink('out'));
  app.process().stderr.on('data', sink('err'));
  const overlay = await waitWindow(app, 'overlay.html');
  await overlay.waitForFunction(() => !!window.glint);
  return { app, overlay, dir, lines };
}

export async function waitWindow(app, part, timeout = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const w = app.windows().find((p) => p.url().includes(part));
    if (w) return w;
    await sleep(200);
  }
  throw new Error(`window ${part} not found`);
}

export async function launchControl() {
  const app = await electron.launch({ args: [join(ROOT, 'tests/fixtures/control-app')], cwd: ROOT, timeout: 60_000 });
  await app.evaluate(async ({ app }) => app.whenReady());
  return app;
}

export const openWin = (ctl, id, spec) => ctl.evaluate((_e, [id, spec]) => globalThis.openWin(id, spec), [id, spec]);
export const closeWin = (ctl, id) => ctl.evaluate((_e, id) => globalThis.closeWin(id), id);
export const focusWin = (ctl, id) => ctl.evaluate((_e, id) => globalThis.focusWin(id), id);

export async function display(app) {
  return app.evaluate(({ screen }) => {
    const d = screen.getPrimaryDisplay();
    return { bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
  });
}

export const winState = async (page, w = 'overlay') => unwrap(await page.evaluate((w) => window.glint.test.getWindowState(w), w));

export function unwrap(r) {
  if (!r?.ok) throw new Error(`glint call failed: ${JSON.stringify(r?.error ?? r)}`);
  return r.value;
}

/** Full-screen capture of the main display (no sound). Returns path. */
export function capture(file) {
  execFileSync('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', file]);
  if (!existsSync(file)) throw new Error('screencapture wrote nothing');
  return file;
}

/** Capture one window by CGWindowID (no shadow). */
export function captureWindow(file, windowId) {
  execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', String(windowId), '-t', 'png', file]);
  return file;
}

/** OCR with the app's Vision helper; returns { text, ...}. */
export function ocrVision(file) {
  const out = execFileSync(join(ROOT, 'native/ocr/bin/glint-ocr'), [file], { maxBuffer: 64 << 20 }).toString();
  return JSON.parse(out);
}

export function ocrTesseract(file) {
  try {
    return execFileSync('/opt/homebrew/bin/tesseract', [file, '-', '--psm', '11'], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    return '';
  }
}

/** Marker presence check tolerant to spaces OCR inserts. */
export function hasMarker(text, m) {
  const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return norm(text).includes(norm(m));
}

export function img(...args) {
  const out = execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', join(ROOT, 'tests/imgtool.py'), ...args.map(String)], { cwd: '/tmp' }).toString();
  return JSON.parse(out.trim().split('\n').pop());
}

/** osascript key press; returns { ok, error }. keyCode 42 = backslash. */
export function osKey(keyCode, mods = ['command down']) {
  try {
    execFileSync('/usr/bin/osascript', ['-e', `tell application "System Events" to key code ${keyCode} using {${mods.join(', ')}}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e.stderr?.toString() || e.message).trim() };
  }
}

export async function waitFor(fn, { timeout = 30_000, every = 250, label = 'condition' } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  throw new Error(`timed out after ${timeout} ms waiting for ${label}`);
}

/** Screen rect (points) of an element inside a Glint window. */
export async function elementScreenRect(page, selector, windowBounds) {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, selector);
  if (!r) return null;
  return { x: windowBounds.x + r.x, y: windowBounds.y + r.y, width: r.width, height: r.height };
}

export async function quit(app) {
  if (!app) return;
  try {
    await Promise.race([app.close(), sleep(8000)]);
  } catch {}
  try {
    app.process().kill('SIGKILL');
  } catch {}
}

// ----- WER -----
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
  if (n < 1e6) return numToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
  return String(n);
}
export function normalise(s) {
  return s
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/\d+/g, (m) => ' ' + numToWords(Number(m)) + ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean);
}
export function wer(refText, hypText) {
  const r = normalise(refText), h = normalise(hypText);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { wer: r.length ? d[r.length][h.length] / r.length : 0, edits: d[r.length][h.length], refWords: r.length, ref: r.join(' '), hyp: h.join(' ') };
}

export const BACKDROP_PLAIN = (label, bg = '#ff00ff', fg = '#000') => `<!doctype html><html><body style="margin:0;background:${bg};font:700 64px -apple-system,Helvetica;color:${fg};height:100vh;display:flex;align-items:flex-end;justify-content:center;padding-bottom:60px;box-sizing:border-box">${label}</body></html>`;

/** Build (once) and run the CGEvent key helper. */
export function cgKey(keyCode, mods = ['cmd'], force = true) {
  const bin = join(OUT, 'bin/keypost');
  if (!existsSync(bin)) { mkdirSync(join(OUT, 'bin'), { recursive: true }); execFileSync('swiftc', ['-O', '-o', bin, join(ROOT, 'tests/fixtures/keypost.swift')]); }
  const pre = JSON.parse(execFileSync(bin, ['--preflight']).toString());
  try {
    const r = JSON.parse(execFileSync(bin, [String(keyCode), ...mods, ...(force ? ['force'] : [])]).toString());
    return { ...r, postEventAccess: pre.postEventAccess };
  } catch (e) {
    return { ok: false, postEventAccess: pre.postEventAccess, error: e.stdout?.toString() || e.message };
  }
}

/** osascript key press with a bounded AppleEvent timeout. */
export function osKeyTimed(keyCode, secs = 10) {
  try {
    execFileSync('/usr/bin/osascript', ['-e', `with timeout of ${secs} seconds`, '-e', `tell application "System Events" to key code ${keyCode} using {command down}`, '-e', 'end timeout'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: (secs + 5) * 1000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e.stderr?.toString() || e.message).trim() };
  }
}

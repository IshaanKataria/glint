// Audio sources. Each one is a child process writing 16 kHz mono s16le PCM to stdout:
//   file   -> ffmpeg decodes any file (GLINT_AUDIO_FILE / req.audioFile)
//   mic    -> ffmpeg avfoundation input (speaker 'me')
//   system -> src/audio/native/system_tap.swift, a Core Audio process tap (speaker 'them')
// See DECISIONS D-A1 (capture choice) and D-A2 (file source behaviour).
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Speaker } from '../shared/contract';

export type SourceKind = 'file' | 'mic' | 'system' | 'echoRef';

export class SourceError extends Error {
  constructor(
    public code: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'INTERNAL' | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
  }
}

export interface SourceOptions {
  kind: SourceKind;
  speaker: Speaker;
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  log(...a: unknown[]): void;
  /** Reject start() if no PCM arrives within this many ms. */
  firstDataTimeoutMs: number;
  /** Optional parser for status lines on stderr (the Swift helper's JSON). */
  onStderrLine?(line: string): SourceError | void;
  /** Keep stdin open (the Swift helper exits when it closes). */
  keepStdin?: boolean;
  /** Treat this stderr JSON event (e.g. "started") as a successful start, before any audio arrives. */
  readyOnStderrEvent?: string;
}

export class PcmSource {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null;
  private stopping = false;
  bytes = 0;
  startedAtMs = 0;
  firstDataAtMs = 0;
  stderrTail = '';

  constructor(
    readonly o: SourceOptions,
    private onData: (d: Buffer) => void,
    /** Called once when the process ends on its own (file finished, device lost, crash). */
    private onEnd: (info: { code: number | null; signal: NodeJS.Signals | null; stopped: boolean }) => void,
  ) {}

  get speaker(): Speaker {
    return this.o.speaker;
  }

  get kind(): SourceKind {
    return this.o.kind;
  }

  /** Resolves when the first PCM bytes arrive; rejects with a SourceError if the process fails first. */
  start(): Promise<void> {
    const o = this.o;
    this.startedAtMs = Date.now();
    const proc = spawn(o.cmd, o.args, { env: o.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    o.log(`${o.kind} source spawned pid=${proc.pid}: ${o.cmd.split('/').pop()} ${o.args.join(' ')}`);
    if (!o.keepStdin) proc.stdin.end();
    proc.stdin.on('error', () => {});
    let settled = false;
    let resolveStart!: () => void;
    let rejectStart!: (e: SourceError) => void;
    const started = new Promise<void>((res, rej) => {
      resolveStart = res;
      rejectStart = rej;
    });
    const settle = (err?: SourceError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) rejectStart(err);
      else resolveStart();
    };
    const timer = setTimeout(() => {
      settle(
        new SourceError(
          'PERMISSION_DENIED',
          `${o.kind} capture delivered no audio within ${o.firstDataTimeoutMs / 1000} s (a macOS permission prompt may be waiting, or access was denied)`,
        ),
      );
      this.kill();
    }, o.firstDataTimeoutMs);

    proc.stdout.on('data', (d: Buffer) => {
      if (!this.firstDataAtMs) this.firstDataAtMs = Date.now();
      this.bytes += d.length;
      settle();
      this.onData(d);
    });
    proc.stderr.setEncoding('utf8');
    let lineBuf = '';
    proc.stderr.on('data', (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-1500);
      lineBuf += d;
      let nl: number;
      while ((nl = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, nl).trim();
        lineBuf = lineBuf.slice(nl + 1);
        if (!line) continue;
        const err = o.onStderrLine?.(line);
        if (err) settle(err);
        else if (o.readyOnStderrEvent && line.startsWith('{')) {
          try {
            if (JSON.parse(line).event === o.readyOnStderrEvent) settle();
          } catch {
            /* not JSON */
          }
        }
      }
    });
    proc.on('error', (err) => settle(new SourceError('NOT_FOUND', `${o.kind} capture could not start: ${err.message}`)));
    this.exited = new Promise((resolve) => {
      proc.on('close', (code, signal) => {
        o.log(`${o.kind} source exited code=${code} signal=${signal} bytes=${this.bytes}`);
        if (!settled) {
          const tail = this.stderrTail.trim().split('\n').slice(-3).join(' | ');
          settle(new SourceError('INTERNAL', `${o.kind} capture exited before any audio (code ${code}): ${tail}`));
        }
        resolve({ code, signal });
        this.onEnd({ code, signal, stopped: this.stopping });
      });
    });
    return started;
  }

  /** Stop capture and wait until the process has exited and all its output was delivered. */
  async stop(timeoutMs = 3000): Promise<void> {
    this.stopping = true;
    if (!this.proc || !this.exited) return;
    const proc = this.proc;
    if (proc.exitCode === null && proc.signalCode === null) {
      if (this.o.keepStdin) proc.stdin.end();
      proc.kill('SIGTERM');
    }
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    await this.exited;
    clearTimeout(t);
  }

  kill(): void {
    this.stopping = true;
    this.proc?.kill('SIGKILL');
  }
}

const FFMPEG_CANDIDATES = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
export function findFfmpeg(): string {
  return process.env.GLINT_FFMPEG ?? FFMPEG_CANDIDATES.find((p) => existsSync(p)) ?? 'ffmpeg';
}

export function fileSourceArgs(file: string, realtime: boolean): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    ...(realtime ? ['-re'] : []),
    '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-',
  ];
}

export function micSourceArgs(device: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'avfoundation', '-i', `:${device}`,
    '-ac', '1', '-ar', '16000', '-f', 's16le', '-',
  ];
}

/** Parses the Swift helper's JSON status lines; returns a SourceError for its error events. */
export function systemTapStderr(log: (...a: unknown[]) => void, label = 'system tap') {
  return (line: string): SourceError | void => {
    let msg: { event?: string; code?: string; message?: string; status?: number };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    log(`${label}: ${line}`);
    if (msg.event !== 'error') return;
    const perm = msg.code === 'PERMISSION_PENDING' || msg.code === 'START_FAILED' || msg.code === 'NO_INPUT';
    return new SourceError(perm ? 'PERMISSION_DENIED' : 'INTERNAL', `${label}: ${msg.code}: ${msg.message}`);
  };
}

/**
 * Compiles src/audio/native/system_tap.swift once per source hash into binDir and returns the
 * binary path. Compiling at runtime keeps the build scripts (Shell-owned) unchanged.
 */
const compiling = new Map<string, Promise<string>>();

/** Memoised per binDir so the app-start pre-compile and a session start never race on the same file. */
export function ensureSystemTapBinary(projectRoot: string, binDir: string, log: (...a: unknown[]) => void): Promise<string> {
  let p = compiling.get(binDir);
  if (!p) {
    p = compileSystemTap(projectRoot, binDir, log);
    compiling.set(binDir, p);
    p.catch(() => compiling.delete(binDir));
  }
  return p;
}

async function compileSystemTap(projectRoot: string, binDir: string, log: (...a: unknown[]) => void): Promise<string> {
  const src = join(projectRoot, 'src/audio/native/system_tap.swift');
  if (!existsSync(src)) throw new SourceError('NOT_FOUND', `missing ${src}`);
  const hash = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 10);
  const bin = join(binDir, `glint-system-tap-${hash}`);
  if (existsSync(bin)) return bin;
  mkdirSync(binDir, { recursive: true });
  const tmp = `${bin}.${process.pid}.tmp`;
  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/swiftc', ['-O', '-o', tmp, src], { timeout: 120_000 }, (err, _out, stderr) => {
      if (err) reject(new SourceError('INTERNAL', `swiftc failed: ${String(stderr || err.message).slice(-500)}`));
      else resolve();
    });
  });
  chmodSync(tmp, 0o755);
  renameSync(tmp, bin);
  log(`compiled system tap helper in ${Date.now() - t0} ms -> ${bin}`);
  return bin;
}

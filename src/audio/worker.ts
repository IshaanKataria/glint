// Long-running WhisperX worker (scripts/whisper_worker.py) over JSON lines.
// One process, model loaded once; requests are answered in order. Restarts after a crash or a
// stuck chunk and resends what was in flight (each request is retried once). See D-A4, D-A5.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface WorkerSegment {
  start: number;
  end: number;
  text: string;
}

export interface WorkerResult {
  segments: WorkerSegment[];
  text: string;
  audioSec: number;
  /** Time the worker spent on this chunk. */
  ms: number;
}

export interface WorkerInfo {
  state: 'stopped' | 'loading' | 'ready' | 'failed';
  pid?: number;
  model: string;
  loadMs?: number;
  restarts: number;
  lastError?: string;
}

interface Pending {
  id: string;
  path: string;
  attempts: number;
  resolve(r: WorkerResult): void;
  reject(e: Error): void;
  timer?: NodeJS.Timeout;
}

export interface WorkerOptions {
  scriptPath: string;
  env: NodeJS.ProcessEnv;
  log(...a: unknown[]): void;
  python?: string;
  model?: string;
  align?: boolean;
  /** Per-chunk timeout once the model is ready. */
  chunkTimeoutMs?: number;
  /** Model load timeout. */
  loadTimeoutMs?: number;
  maxRestarts?: number;
}

export const DEFAULT_PYTHON = join(homedir(), '.cache/watch/whisperx-venv/bin/python');

export class WhisperWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private queue: Pending[] = []; // sent or waiting, in order
  private seq = 0;
  private stdoutBuf = '';
  private readyWaiters: { resolve(): void; reject(e: Error): void }[] = [];
  private loadTimer?: NodeJS.Timeout;
  private restartsInWindow: number[] = [];
  private shuttingDown = false;
  info: WorkerInfo;

  constructor(private o: WorkerOptions) {
    this.info = { state: 'stopped', model: o.model ?? 'small', restarts: 0 };
  }

  get python(): string {
    return this.o.python ?? DEFAULT_PYTHON;
  }

  /** Spawn the worker if it isn't running. Returns immediately; use ready() to wait for the model. */
  start(): void {
    if (this.proc || this.shuttingDown) return;
    if (!existsSync(this.python)) {
      this.fail(`WhisperX python not found at ${this.python}`);
      return;
    }
    const args = [this.o.scriptPath, '--model', this.info.model, '--compute-type', 'int8', '--language', 'en'];
    if (this.o.align) args.push('--align');
    const t0 = Date.now();
    const proc = spawn(this.python, args, { env: this.o.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    this.info = { ...this.info, state: 'loading', pid: proc.pid, lastError: undefined };
    this.o.log(`worker spawned pid=${proc.pid} (${this.python} ${args.slice(1).join(' ')})`);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d: string) => this.onStdout(d));
    let errTail = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d: string) => {
      errTail = (errTail + d).slice(-2000);
      for (const line of d.split('\n')) if (line.includes('[whisper_worker]')) this.o.log(line.trim());
    });
    proc.stdin.on('error', () => {}); // EPIPE after a crash; handled by 'exit'
    proc.on('error', (err) => this.o.log('worker spawn error:', err.message));
    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return;
      this.proc = null;
      clearTimeout(this.loadTimer);
      for (const p of this.queue) clearTimeout(p.timer);
      if (this.shuttingDown) {
        this.info.state = 'stopped';
        return;
      }
      const why = `worker exited code=${code} signal=${signal} after ${Date.now() - t0} ms; stderr tail: ${errTail.split('\n').slice(-4).join(' | ')}`;
      this.o.log(why);
      this.restart(why);
    });
    this.loadTimer = setTimeout(() => {
      if (this.info.state === 'loading' && this.proc === proc) {
        this.o.log('worker model load timed out; killing');
        proc.kill('SIGKILL');
      }
    }, this.o.loadTimeoutMs ?? 180_000);
  }

  ready(): Promise<void> {
    if (this.info.state === 'ready') return Promise.resolve();
    if (this.info.state === 'failed') return Promise.reject(new Error(this.info.lastError ?? 'worker failed'));
    this.start();
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }));
  }

  transcribe(path: string): Promise<WorkerResult> {
    if (this.info.state === 'failed') return Promise.reject(new Error(this.info.lastError ?? 'worker failed'));
    this.start();
    return new Promise((resolve, reject) => {
      const p: Pending = { id: `c${++this.seq}`, path, attempts: 0, resolve, reject };
      this.queue.push(p);
      if (this.info.state === 'ready') this.send(p);
    });
  }

  /** Clear a 'failed' state so the next start() tries again (e.g. on a new session). */
  reset(): void {
    if (this.info.state !== 'failed') return;
    this.restartsInWindow = [];
    this.info = { ...this.info, state: 'stopped', lastError: undefined };
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  /** Graceful stop: ask the worker to exit, then SIGKILL after graceMs. */
  async shutdown(graceMs = 2000): Promise<void> {
    this.shuttingDown = true;
    const proc = this.proc;
    for (const p of this.queue.splice(0)) {
      clearTimeout(p.timer);
      p.reject(new Error('worker shut down'));
    }
    if (!proc) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, graceMs);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      try {
        proc.stdin.write(JSON.stringify({ op: 'shutdown' }) + '\n');
        proc.stdin.end();
      } catch {
        proc.kill('SIGKILL');
      }
    });
  }

  /** Synchronous last-resort kill (app quit). */
  killNow(): void {
    this.shuttingDown = true;
    this.proc?.kill('SIGKILL');
  }

  private send(p: Pending): void {
    if (!this.proc) return;
    p.attempts++;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      this.o.log(`chunk ${p.id} timed out; restarting worker`);
      this.proc?.kill('SIGKILL');
    }, this.o.chunkTimeoutMs ?? 60_000);
    this.proc.stdin.write(JSON.stringify({ id: p.id, op: 'transcribe', path: p.path }) + '\n');
  }

  private onStdout(d: string): void {
    this.stdoutBuf += d;
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf('\n')) >= 0) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        this.o.log('worker sent non-JSON line:', line.slice(0, 200));
        continue;
      }
      this.onMessage(msg);
    }
  }

  private onMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'ready') {
      clearTimeout(this.loadTimer);
      this.info = { ...this.info, state: 'ready', loadMs: Number(msg.loadMs) };
      this.o.log(`worker ready: model=${msg.model} loadMs=${msg.loadMs}`);
      for (const w of this.readyWaiters.splice(0)) w.resolve();
      for (const p of this.queue) this.send(p);
      return;
    }
    const id = msg.id as string | undefined;
    const i = this.queue.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = this.queue.splice(i, 1);
    clearTimeout(p.timer);
    if (msg.type === 'result') {
      p.resolve({
        segments: (msg.segments as WorkerSegment[]) ?? [],
        text: String(msg.text ?? ''),
        audioSec: Number(msg.audioSec ?? 0),
        ms: Number(msg.ms ?? 0),
      });
    } else {
      p.reject(new Error(String(msg.message ?? 'worker error')));
    }
  }

  private restart(why: string): void {
    const now = Date.now();
    this.restartsInWindow = this.restartsInWindow.filter((t) => now - t < 120_000);
    if (this.restartsInWindow.length >= (this.o.maxRestarts ?? 3)) {
      this.fail(`worker crashed ${this.restartsInWindow.length + 1} times in 2 min; giving up (${why})`);
      return;
    }
    // Each in-flight request gets one retry; a chunk that crashed the worker twice is dropped.
    for (const p of [...this.queue]) {
      if (p.attempts >= 2) {
        this.queue.splice(this.queue.indexOf(p), 1);
        p.reject(new Error(`chunk failed twice (${why})`));
      }
    }
    this.restartsInWindow.push(now);
    this.info.restarts++;
    this.info.state = 'stopped';
    this.o.log(`restarting worker (restart #${this.info.restarts})`);
    setTimeout(() => this.start(), 500);
  }

  private fail(message: string): void {
    this.info = { ...this.info, state: 'failed', lastError: message };
    this.o.log(message);
    for (const w of this.readyWaiters.splice(0)) w.reject(new Error(message));
    for (const p of this.queue.splice(0)) p.reject(new Error(message));
  }
}

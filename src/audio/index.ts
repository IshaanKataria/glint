// Audio + transcription: session:start/stop/getStatus, capture sources, rolling chunks, WhisperX.
//
// Events per session (in this order):
//   session:status {state:'starting'} -> bus session:started -> session:status {state:'recording'}
//   -> per chunk: session:segment + bus transcript:segment
//   -> (file source only) audio:fileDone (event + bus); the session stays open by default
//   -> on stop: session:status {state:'stopping'} -> last chunks transcribed
//   -> session:status {state:'idle'} -> bus session:stopped (the sessions module then emits summarizing/saved)
import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlintError, type ServiceContext } from '../main/context';
import type { AudioChunkStat, AudioStats, SessionStatus, Speaker, TranscriptSegment } from '../shared/contract';
import { Chunker, dbfs, DEFAULT_CHUNKER, SAMPLE_RATE, wavBytes, type Chunk } from './chunker';
import { echoDecision, Envelope, envelopeOf } from './echo';
import {
  ensureSystemTapBinary,
  fileSourceArgs,
  findFfmpeg,
  micSourceArgs,
  PcmSource,
  SourceError,
  systemTapStderr,
} from './sources';
import { WhisperWorker } from './worker';

const env = process.env;
const FILE_SPEAKER: Speaker = env.GLINT_AUDIO_FILE_SPEAKER === 'me' ? 'me' : 'them';
const FILE_PACE: 'fast' | 'realtime' = env.GLINT_AUDIO_FILE_PACE === 'realtime' ? 'realtime' : 'fast';
const FILE_AUTOSTOP = env.GLINT_AUDIO_FILE_AUTOSTOP === '1';
const SYSTEM_AUDIO = env.GLINT_SYSTEM_AUDIO !== '0';
const MIC_DEVICE = env.GLINT_MIC_DEVICE ?? 'default';
/** D-A9: mic through the Swift helper (AVAudioEngine) by default; GLINT_MIC_BACKEND=ffmpeg for avfoundation. */
const MIC_BACKEND: 'swift' | 'ffmpeg' = env.GLINT_MIC_BACKEND === 'ffmpeg' ? 'ffmpeg' : 'swift';
const KEEP_CHUNKS = env.GLINT_AUDIO_KEEP_CHUNKS === '1';
const STOP_DRAIN_TIMEOUT_MS = 120_000;
/** D-A8: drop mic chunks that are only the built-in speakers' sound coming back (GLINT_ECHO_FILTER=0 disables). */
const ECHO_FILTER = env.GLINT_ECHO_FILTER !== '0';
/** Debug: append every source's PCM to <dir>/<session>-<run>-<kind>.s16le (levels analysis). */
const DUMP_DIR = env.GLINT_AUDIO_DUMP_DIR;

interface Active {
  id: string;
  startedAt: number;
  /** Seconds added to every tStart/tEnd (resumed sessions continue after the old transcript). */
  timeOffset: number;
  /** Unique per run so resumed segment ids never collide with earlier ones. */
  runTag: string;
  chunkDir: string;
  sources: PcmSource[];
  chunkers: Map<PcmSource, Chunker>;
  pending: Set<Promise<void>>;
  seq: number;
  segments: number;
  stopping: boolean;
  systemAudio?: string;
  zeroWarned: Set<string>;
  /** Envelope of what the built-in speakers play (echo reference), on the session clock (no resume offset). */
  refEnv?: Envelope;
  echoRef?: string;
  /** Learned echo level (mic dB - speaker dB), median of earlier echo chunks. */
  couplings: number[];
}

export function register(ctx: ServiceContext): void {
  const log = (...a: unknown[]) => ctx.log('audio', ...a);
  const worker = new WhisperWorker({
    scriptPath: join(ctx.projectRoot, 'scripts/whisper_worker.py'),
    env: ctx.childEnv(), // no DeepSeek key in the worker's environment
    log: (...a) => ctx.log('whisper', ...a),
    python: env.GLINT_WHISPER_PYTHON,
    model: env.GLINT_WHISPER_MODEL ?? 'small',
    align: env.GLINT_WHISPER_ALIGN === '1',
  });

  let status: SessionStatus = { state: 'idle' };
  let active: Active | null = null;
  let lastStats: AudioChunkStat[] = [];
  let lastSessionId: string | undefined;
  let lastSystemAudio: string | undefined;
  let lastSources: PcmSource[] = [];
  let lastActive: Active | null = null;

  const setStatus = (s: SessionStatus) => {
    status = s;
    ctx.emit('session:status', s);
  };

  const helperBinary = () => ensureSystemTapBinary(ctx.projectRoot, join(app.getPath('userData'), 'bin'), log);

  function newSessionId(now: number): string {
    const d = new Date(now);
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function sourceLabel(a: Active): SessionStatus['source'] {
    const kinds = new Set(a.sources.map((s) => s.kind));
    if (kinds.has('file')) return 'file';
    return kinds.has('system') ? 'mic+system' : 'mic';
  }

  function onChunk(a: Active, src: PcmSource, chunk: Chunk, streamOffsetSec: number): void {
    const tStart = a.timeOffset + streamOffsetSec + chunk.offsetSec;
    const stat: AudioChunkStat = {
      speaker: src.speaker,
      tStart: round(tStart),
      durationSec: round(chunk.durationSec),
      skipped: chunk.silent,
      skipReason: chunk.silent ? 'silence' : undefined,
      peakDb: dbfs(chunk.peak),
      rmsDb: dbfs(chunk.rms),
      maxFrameDb: dbfs(chunk.maxFrameRms),
      noiseFloorDb: dbfs(chunk.noiseFloor),
      voicedThresholdDb: dbfs(chunk.voicedRms),
      voicedSec: round(chunk.voicedSec),
    };
    lastStats.push(stat);
    const chunker = a.chunkers.get(src)!;
    // Mic only: a working mic always has a noise floor, while the system tap is legitimately all
    // zeros whenever nothing is playing (A16: this fired falsely for system audio).
    if (src.kind === 'mic' && !a.zeroWarned.has(src.kind) && chunker.totalSamples >= 16000 * 3 && chunker.nonZeroSamples === 0) {
      a.zeroWarned.add(src.kind);
      const where =
        src.kind === 'mic'
          ? 'System Settings > Privacy & Security > Microphone'
          : 'System Settings > Privacy & Security > Screen & System Audio Recording > System Audio Recording Only';
      const msg = `${src.kind === 'mic' ? 'Microphone' : 'System audio'} is delivering pure silence (all-zero samples): turn on the app that launched Glint in ${where}`;
      log(msg);
      if (a === active && !a.stopping) setStatus({ ...status, message: msg });
    }
    // Levels only, never audio content.
    const levels = `peak=${stat.peakDb}dBFS rms=${stat.rmsDb} maxFrame=${stat.maxFrameDb} floor=${stat.noiseFloorDb} voicedThr=${stat.voicedThresholdDb} voiced=${stat.voicedSec}s`;
    const label = `chunk ${src.speaker}/${src.kind} t=${stat.tStart}s dur=${stat.durationSec}s`;
    if (chunk.silent) {
      log(`${label} SKIPPED (silence): ${levels}`);
      return;
    }
    log(`${label} queued: ${levels}`);
    const n = String(++a.seq).padStart(4, '0');
    const path = join(a.chunkDir, `${src.kind}-${n}.wav`);
    const p: Promise<void> = (async () => {
      if (src.kind === 'mic' && a.refEnv && ECHO_FILTER) {
        const t0 = tStart - a.timeOffset; // session clock of the envelopes
        const refEnv = a.refEnv;
        // The speaker tap only delivers while something plays, so don't wait long for it.
        await waitUntil(() => refEnv.endSec >= t0 + chunk.durationSec + 0.6 || a.stopping, 1000);
        const coupling = a.couplings.length ? median(a.couplings) : undefined;
        const d = echoDecision(envelopeOf(chunk.pcm), t0, refEnv, chunk.voicedRms, DEFAULT_CHUNKER.voicedAbsRms * 4, coupling);
        stat.echoUserSec = d.userSec;
        stat.echoExplainedSec = d.explainedSec;
        stat.refVoicedSec = d.refVoicedSec;
        stat.couplingDb = d.couplingDb;
        log(`${label} echo check: micVoiced=${d.micVoicedSec}s explainedBySpeakers=${d.explainedSec}s user=${d.userSec}s speakerVoiced=${d.refVoicedSec}s coupling=${d.couplingDb ?? '-'}dB learned=${coupling ?? '-'}dB -> ${d.echo ? 'ECHO of the speakers, not transcribed as me' : 'keep'}`);
        if (d.echo) {
          if (d.couplingDb !== undefined) a.couplings.push(d.couplingDb);
          stat.skipped = true;
          stat.skipReason = 'echo';
          return;
        }
      }
      const cutAt = Date.now();
      writeFileSync(path, wavBytes(chunk.pcm));
      try {
        const r = await worker.transcribe(path);
        stat.workerMs = r.ms;
        stat.latencyMs = Date.now() - cutAt;
        const segs = r.segments.filter((s) => s.text.trim());
        stat.chars = segs.reduce((k, s) => k + s.text.length, 0);
        if (!segs.length) {
          log(`${label} -> no speech found by WhisperX`);
          return;
        }
        const seg: TranscriptSegment = {
          sessionId: a.id,
          id: `${a.runTag}-${src.speaker}-${n}`,
          speaker: src.speaker,
          text: segs.map((s) => s.text.trim()).join(' '),
          tStart: round(tStart + segs[0].start),
          tEnd: round(tStart + Math.min(chunk.durationSec, segs[segs.length - 1].end)),
        };
        a.segments++;
        ctx.emit('session:segment', seg);
        ctx.bus.emit('transcript:segment', seg);
        log(`segment ${seg.speaker} [${seg.tStart}-${seg.tEnd}s] worker=${r.ms}ms latency=${stat.latencyMs}ms: ${seg.text.slice(0, 80)}`);
      } catch (err) {
        stat.error = (err as Error).message;
        log(`chunk ${path} failed: ${stat.error}`);
      } finally {
        if (!KEEP_CHUNKS) rmSync(path, { force: true });
      }
    })().finally(() => a.pending.delete(p));
    a.pending.add(p);
  }

  async function drain(a: Active): Promise<void> {
    const deadline = Date.now() + STOP_DRAIN_TIMEOUT_MS;
    while (a.pending.size && Date.now() < deadline) {
      await Promise.race([Promise.allSettled([...a.pending]), sleep(500)]);
    }
    if (a.pending.size) log(`stop: ${a.pending.size} chunk(s) still pending after ${STOP_DRAIN_TIMEOUT_MS} ms; giving up on them`);
  }

  function makeSource(
    a: Active,
    kind: 'file' | 'mic' | 'system' | 'echoRef',
    cmd: string,
    args: string[],
    extra: Partial<ConstructorParameters<typeof PcmSource>[0]> = {},
  ) {
    const speaker: Speaker = kind === 'mic' ? 'me' : kind === 'file' ? FILE_SPEAKER : 'them';
    let streamOffsetSec = 0;
    let wall0 = 0; // wall-clock ms of the stream's first sample
    let carry: Buffer | null = null;
    const feed = (buf: Buffer) => {
      if (carry) {
        buf = Buffer.concat([carry, buf]);
        carry = null;
      }
      if (buf.length % 2) {
        carry = buf.subarray(buf.length - 1);
        buf = buf.subarray(0, buf.length - 1);
      }
      if (!buf.length) return;
      if (DUMP_DIR) appendFileSync(join(DUMP_DIR, `${a.id}-${a.runTag}-${kind}.s16le`), buf);
      if (kind === 'echoRef') {
        a.refEnv ??= new Envelope(streamOffsetSec);
        const s16 = new Int16Array(buf.length / 2);
        for (let i = 0; i < s16.length; i++) s16[i] = buf.readInt16LE(i * 2);
        a.refEnv.push(s16);
        return;
      }
      chunker?.push(buf);
    };
    const src: PcmSource = new PcmSource(
      { kind, speaker, cmd, args, env: ctx.childEnv(), log, firstDataTimeoutMs: kind === 'file' ? 30_000 : 8_000, ...extra },
      (d) => {
        // Session clock: a live stream starts when its first bytes arrive. Later gaps (a tap with an
        // idle output device) are filled with silence inside the Swift helper from host timestamps;
        // padding here from arrival times added 1.8 s of false gaps to a continuous mic stream (A13).
        if (kind !== 'file' && !wall0) {
          wall0 = Date.now() - (d.length / 2 / SAMPLE_RATE) * 1000;
          streamOffsetSec = Math.max(0, (wall0 - a.startedAt) / 1000);
        }
        feed(d);
      },
      (info) => void onSourceEnd(a, src, info),
    );
    const chunker = kind === 'echoRef' ? null : new Chunker((c) => onChunk(a, src, c, streamOffsetSec), DEFAULT_CHUNKER);
    if (chunker) a.chunkers.set(src, chunker);
    return src;
  }

  async function onSourceEnd(a: Active, src: PcmSource, info: { code: number | null; stopped: boolean }): Promise<void> {
    if (info.stopped || a.stopping) return;
    a.chunkers.get(src)?.flush();
    if (src.kind === 'file') {
      await drain(a);
      if (a !== active || a.stopping) return;
      const done = { sessionId: a.id, audioSec: round(src.bytes / 2 / 16000), segments: a.segments, autoStop: FILE_AUTOSTOP };
      log(`file source finished: ${done.audioSec}s of audio, ${done.segments} segment(s); autoStop=${FILE_AUTOSTOP}`);
      ctx.emit('audio:fileDone', done);
      ctx.bus.emit('audio:fileDone', done);
      if (FILE_AUTOSTOP) await stop();
      else setStatus({ ...status, message: 'Audio file finished; session stays open until you stop it' });
      return;
    }
    // A live source died on its own (device unplugged, helper crash).
    log(`${src.kind} capture ended unexpectedly (code ${info.code}): ${src.stderrTail.trim().slice(-300)}`);
    a.sources = a.sources.filter((s) => s !== src);
    if (src.kind === 'echoRef') {
      a.echoRef = `off: speaker reference stopped (code ${info.code})`;
      a.refEnv = undefined;
      return;
    }
    const alive = a.sources.filter((s) => s.kind !== 'echoRef');
    if (!alive.length) {
      setStatus({ ...status, state: 'error', message: `${src.kind} capture stopped unexpectedly` });
      await stop();
    } else setStatus({ ...status, source: sourceLabel(a), message: `${src.kind} capture stopped; continuing with ${alive.map((s) => s.kind).join('+')}` });
  }

  async function startSystemAudio(a: Active): Promise<void> {
    try {
      const bin = await helperBinary();
      if (a !== active || a.stopping) return;
      // The tap delivers nothing until something plays, so it counts as started on the helper's
      // "started" event, not on first audio (otherwise silence at session start looked like a failure).
      const tapOpts = { keepStdin: true, onStderrLine: systemTapStderr(log), readyOnStderrEvent: 'started', firstDataTimeoutMs: 12_000 };
      const src = makeSource(a, 'system', bin, [], tapOpts);
      a.sources.push(src);
      try {
        await src.start();
      } catch (err) {
        a.sources = a.sources.filter((s) => s !== src);
        throw err;
      }
      if (a !== active || a.stopping) return;
      a.systemAudio = 'on';
      log('system audio capture running (speaker them)');
      setStatus({ ...status, source: sourceLabel(a), message: undefined });
      if (ECHO_FILTER) {
        // Echo reference: only what the built-in speakers play (headphones/AirPods can't leak into the mic).
        const ref = makeSource(a, 'echoRef', bin, ['--device', 'builtin-speaker'], tapOpts);
        a.sources.push(ref);
        try {
          await ref.start();
          a.echoRef = 'on: built-in speakers';
        } catch (err) {
          a.sources = a.sources.filter((s) => s !== ref);
          a.echoRef = `off: ${(err as Error).message}`;
        }
        log(`echo reference ${a.echoRef}`);
      } else a.echoRef = 'off: GLINT_ECHO_FILTER=0';
    } catch (err) {
      const msg = (err as Error).message;
      a.systemAudio = `off: ${msg}`;
      log(`system audio unavailable, continuing mic-only: ${msg}`);
      if (a === active && !a.stopping) setStatus({ ...status, message: `Mic only. ${msg}` });
    }
  }

  async function start(req: { audioFile?: string; resumeSessionId?: string } | void): Promise<SessionStatus> {
    if (active) throw new GlintError('BUSY', `A session is already ${status.state} (${active.id})`);
    const audioFile = req?.audioFile ?? ctx.flags.audioFile;
    if (audioFile && !existsSync(audioFile)) throw new GlintError('BAD_REQUEST', `Audio file not found: ${audioFile}`);
    const now = Date.now();
    let timeOffset = 0;
    const id = req?.resumeSessionId ?? newSessionId(now);
    if (req?.resumeSessionId) {
      const prev = await ctx.call('history:get', { id: req.resumeSessionId });
      if (prev.ok) {
        const lastEnd = prev.value.segments.reduce((m, s) => Math.max(m, s.tEnd), 0);
        timeOffset = round(Math.max(lastEnd, prev.value.durationMs / 1000));
      } else log(`resume ${req.resumeSessionId}: history:get failed (${prev.error.code}); times start at 0`);
    }
    const a: Active = {
      id,
      startedAt: now,
      timeOffset,
      runTag: now.toString(36),
      chunkDir: join(tmpdir(), 'glint-audio', `${id}-${now.toString(36)}`),
      sources: [],
      chunkers: new Map(),
      pending: new Set(),
      seq: 0,
      segments: 0,
      stopping: false,
      zeroWarned: new Set(),
      couplings: [],
    };
    mkdirSync(a.chunkDir, { recursive: true });
    if (DUMP_DIR) mkdirSync(DUMP_DIR, { recursive: true });
    active = a;
    lastStats = [];
    lastSessionId = id;
    if (worker.info.state === 'failed') worker.reset();
    worker.start();
    setStatus({
      state: 'starting',
      sessionId: id,
      startedAt: now,
      source: audioFile ? 'file' : 'mic',
      message: worker.info.state === 'ready' ? 'Connecting audio...' : 'Loading transcription model...',
    });

    try {
      if (audioFile) {
        const src = makeSource(a, 'file', findFfmpeg(), fileSourceArgs(audioFile, FILE_PACE === 'realtime'));
        a.sources.push(src);
        await src.start();
      } else {
        let helper: string | null = null;
        if (MIC_BACKEND === 'swift') {
          helper = await helperBinary().catch((err: Error) => {
            log(`mic helper unavailable (${err.message}); falling back to ffmpeg avfoundation`);
            return null;
          });
        }
        const mic = helper
          ? makeSource(a, 'mic', helper, ['--mic'], { keepStdin: true, onStderrLine: systemTapStderr(log, 'mic helper') })
          : makeSource(a, 'mic', findFfmpeg(), micSourceArgs(MIC_DEVICE));
        a.sources.push(mic);
        if (SYSTEM_AUDIO) void startSystemAudio(a);
        else a.systemAudio = 'off: GLINT_SYSTEM_AUDIO=0';
        await mic.start();
      }
    } catch (err) {
      const e = err as Error;
      log(`start failed: ${e.message}`);
      for (const s of a.sources) s.kill();
      active = null;
      lastSources = a.sources;
      rmSync(a.chunkDir, { recursive: true, force: true });
      const code = err instanceof SourceError ? err.code : 'INTERNAL';
      setStatus({ state: 'error', sessionId: id, message: e.message });
      throw new GlintError(code, e.message);
    }

    ctx.bus.emit('session:started', { sessionId: id, startedAt: now, resumed: !!req?.resumeSessionId, source: sourceLabel(a) });
    setStatus({
      state: 'recording',
      sessionId: id,
      startedAt: now,
      source: sourceLabel(a),
      message: worker.info.state === 'ready' ? undefined : 'Loading transcription model...',
    });
    if (worker.info.state !== 'ready') {
      worker.ready().then(
        () => {
          if (active === a && !a.stopping && status.message === 'Loading transcription model...') setStatus({ ...status, message: undefined });
        },
        (err: Error) => {
          if (active === a) setStatus({ ...status, message: `Transcription unavailable: ${err.message}` });
        },
      );
    }
    log(`session ${id} recording (source ${sourceLabel(a)}, timeOffset ${timeOffset}s)`);
    return status;
  }

  let stopping: Promise<SessionStatus> | null = null;
  function stop(): Promise<SessionStatus> {
    if (stopping) return stopping;
    const a = active;
    if (!a) return Promise.resolve(status);
    stopping = (async () => {
      a.stopping = true;
      setStatus({ ...status, state: 'stopping', message: 'Finishing transcript...' });
      await Promise.all(a.sources.map((s) => s.stop()));
      for (const c of a.chunkers.values()) c.flush();
      await drain(a);
      const endedAt = Date.now();
      lastSources = a.sources;
      lastSystemAudio = a.systemAudio;
      lastActive = a;
      active = null;
      if (!KEEP_CHUNKS) rmSync(a.chunkDir, { recursive: true, force: true });
      log(`session ${a.id} stopped: ${a.segments} segment(s)`);
      setStatus({ state: 'idle', sessionId: a.id, message: 'Stopped' });
      ctx.bus.emit('session:stopped', { sessionId: a.id, endedAt });
      return status;
    })().finally(() => {
      stopping = null;
    });
    return stopping;
  }

  ctx.handle('session:start', (req) => start(req));
  ctx.handle('session:stop', () => stop());
  ctx.handle('session:getStatus', () => status);
  ctx.handle('audio:getStats', (): AudioStats => {
    const srcs = active?.sources ?? lastSources;
    return {
      sessionId: active?.id ?? lastSessionId,
      worker: { ...worker.info },
      sources: srcs.map((s) => ({
        kind: s.kind,
        speaker: s.speaker,
        bytes: s.bytes,
        running: !!active && !active.stopping,
      })),
      echoReference: (active ?? lastActive)?.echoRef,
      systemAudio: active?.systemAudio ?? lastSystemAudio,
      chunks: lastStats,
      config: {
        minChunkSec: DEFAULT_CHUNKER.minSec,
        maxChunkSec: DEFAULT_CHUNKER.maxSec,
        fileSpeaker: FILE_SPEAKER,
        filePace: FILE_PACE,
        fileAutoStop: FILE_AUTOSTOP,
        echoFilter: ECHO_FILTER,
      },
    };
  });

  // D-A5: pre-warm the model at app start so the first Listen has no ~6-20 s model load.
  // Off by default under GLINT_TEST unless an audio file is set (other agents' UI tests).
  // Compile the Swift capture helper at app start (no-op when cached), so a changed helper source
  // can't delay capture inside a session (A15: system audio never started while swiftc was busy).
  setTimeout(() => void helperBinary().catch((err: Error) => log(`capture helper compile failed: ${err.message}`)), 500);

  const prewarm = env.GLINT_WHISPER_PREWARM ?? (ctx.flags.test && !ctx.flags.audioFile ? '0' : '1');
  if (prewarm === '1') setTimeout(() => worker.start(), 1000);

  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    if (!active && worker.info.state !== 'loading' && worker.info.state !== 'ready') return;
    quitting = true;
    e.preventDefault();
    log('quit: stopping capture and the WhisperX worker');
    const done = (async () => {
      if (active) await Promise.race([stop(), sleep(8000)]);
      await worker.shutdown(2000);
    })();
    void done.finally(() => app.quit());
  });
  app.on('will-quit', () => {
    for (const s of active?.sources ?? []) s.kill();
    worker.killNow();
  });

  log(`registered (prewarm=${prewarm}, fileSpeaker=${FILE_SPEAKER}, filePace=${FILE_PACE}, fileAutoStop=${FILE_AUTOSTOP}, systemAudio=${SYSTEM_AUDIO})`);
}

function median(a: number[]): number {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond() && Date.now() < end) await sleep(100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

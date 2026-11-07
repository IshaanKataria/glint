// Echo handling between the mic ('me') and what the built-in speakers play. When a meeting plays
// through the speakers, the mic hears 'them' too. Speakerphone-style double-talk test (Geigel):
// a voiced mic frame counts as the user's own speech only if the speakers were silent around it,
// or if it is far louder than the learned speaker->mic echo level. A mic chunk with less than
// minUserSec of such frames is echo and is not transcribed as 'me'. See DECISIONS D-A8.
//
// Rejected (measured in A14): envelope correlation (unrelated phrases scored 0.86 vs echo 0.68)
// and GCC-PHAT (echo peaks 0.023-0.034 vs unrelated 0.014-0.032); the built-in mic's own
// processing distorts the echo too much for signal-level matching.
import { frameRms, SAMPLE_RATE } from './chunker';

export const FRAME = 320; // 20 ms
const FRAME_SEC = FRAME / SAMPLE_RATE;

/** Frame-RMS envelope of one stream on the session clock (seconds from session start). */
export class Envelope {
  private frames: number[] = [];
  private partial: number[] = [];
  constructor(public startSec: number) {}

  push(pcm: Int16Array): void {
    let i = 0;
    if (this.partial.length) {
      const need = FRAME - this.partial.length;
      for (; i < Math.min(need, pcm.length); i++) this.partial.push(pcm[i]);
      if (this.partial.length < FRAME) return;
      this.frames.push(frameRms(Int16Array.from(this.partial), 0, FRAME));
      this.partial = [];
    }
    for (; i + FRAME <= pcm.length; i += FRAME) this.frames.push(frameRms(pcm, i, FRAME));
    for (; i < pcm.length; i++) this.partial.push(pcm[i]);
  }

  get endSec(): number {
    return this.startSec + this.frames.length * FRAME_SEC;
  }

  /** Loudest frame RMS within [t0, t1]; time outside the recorded range is silence (0). */
  maxIn(t0: number, t1: number): number {
    const a = Math.max(0, Math.floor((t0 - this.startSec) / FRAME_SEC));
    const b = Math.min(this.frames.length - 1, Math.ceil((t1 - this.startSec) / FRAME_SEC));
    let m = 0;
    for (let j = a; j <= b; j++) if (this.frames[j] > m) m = this.frames[j];
    return m;
  }

  voicedSecIn(t0: number, t1: number, thr: number): number {
    const a = Math.max(0, Math.floor((t0 - this.startSec) / FRAME_SEC));
    const b = Math.min(this.frames.length - 1, Math.ceil((t1 - this.startSec) / FRAME_SEC));
    let n = 0;
    for (let j = a; j <= b; j++) if (this.frames[j] > thr) n++;
    return n * FRAME_SEC;
  }
}

export function envelopeOf(pcm: Int16Array): Float64Array {
  const n = Math.floor(pcm.length / FRAME);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = frameRms(pcm, k * FRAME, FRAME);
  return out;
}

const db = (v: number) => 20 * Math.log10(Math.max(v, 1));

export interface EchoOptions {
  /** ± seconds of speaker activity that can explain a mic frame (alignment slack + room delay). */
  windowSec: number;
  /** A mic frame this many dB above the learned echo level is the user talking over the speakers. */
  doubleTalkMarginDb: number;
  /** Seconds of user frames needed to treat the chunk as the user's speech. */
  minUserSec: number;
}

export const DEFAULT_ECHO: EchoOptions = { windowSec: 0.6, doubleTalkMarginDb: 12, minUserSec: 0.3 };

export interface EchoDecision {
  echo: boolean;
  /** Voiced mic seconds, those explained by speaker playback, and those attributed to the user. */
  micVoicedSec: number;
  explainedSec: number;
  userSec: number;
  /** Speaker (echo reference) voiced seconds around the chunk. */
  refVoicedSec: number;
  /** Median mic-minus-speaker level (dB) over explained frames: this chunk's echo path estimate. */
  couplingDb?: number;
}

/**
 * mic: frame RMS of the mic chunk starting at session time t0. ref: speaker envelope.
 * couplingDb: learned echo level (mic dB - speaker dB) from earlier echo chunks, if any.
 */
export function echoDecision(
  mic: Float64Array,
  t0: number,
  ref: Envelope,
  micVoicedRms: number,
  refVoicedRms: number,
  couplingDb: number | undefined,
  o: EchoOptions = DEFAULT_ECHO,
): EchoDecision {
  let voiced = 0;
  let explained = 0;
  let user = 0;
  const diffs: number[] = [];
  for (let k = 0; k < mic.length; k++) {
    if (mic[k] <= micVoicedRms) continue;
    voiced++;
    const t = t0 + k * FRAME_SEC;
    const refMax = ref.maxIn(t - o.windowSec, t + o.windowSec);
    if (refMax <= refVoicedRms) {
      user++; // speakers silent: this can only be someone in the room
      continue;
    }
    const d = db(mic[k]) - db(refMax);
    if (couplingDb !== undefined && d > couplingDb + o.doubleTalkMarginDb) {
      user++; // far louder than the speakers' echo: the user talking over them
      continue;
    }
    explained++;
    diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    echo: voiced > 0 && user * FRAME_SEC < o.minUserSec,
    micVoicedSec: r2(voiced * FRAME_SEC),
    explainedSec: r2(explained * FRAME_SEC),
    userSec: r2(user * FRAME_SEC),
    refVoicedSec: r2(ref.voicedSecIn(t0 - o.windowSec, t0 + mic.length * FRAME_SEC + o.windowSec, refVoicedRms)),
    couplingDb: diffs.length ? Math.round(diffs[Math.floor(diffs.length / 2)] * 10) / 10 : undefined,
  };
}

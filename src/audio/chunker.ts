// Rolling chunker for 16 kHz mono s16le PCM. Cuts 4-8 s chunks at a pause (silence-seeking,
// no overlap), so words are rarely split and nothing is transcribed twice. See DECISIONS D-A3.
// Quiet/voiced thresholds are relative to each stream's own noise floor (D-A7): the built-in mic
// runs with a floor near 1 RMS and speech at 30-300 RMS, so a fixed -46 dBFS gate called it silence.

export const SAMPLE_RATE = 16000;
const FRAME = 320; // 20 ms

export interface ChunkerOptions {
  minSec: number;
  maxSec: number;
  /** A pause this long (after minSec) ends a chunk early. */
  pauseSec: number;
  /** A frame is quiet (pause) at or below max(quietAbsRms, noiseFloor * quietOverFloor). */
  quietAbsRms: number;
  quietOverFloor: number;
  /** A frame is voiced above max(voicedAbsRms, noiseFloor * voicedOverFloor). */
  voicedAbsRms: number;
  voicedOverFloor: number;
  /** Chunks with less voiced audio than this are not transcribed (silence). */
  minVoicedSec: number;
}

export const DEFAULT_CHUNKER: ChunkerOptions = {
  minSec: 4,
  maxSec: 8,
  pauseSec: 0.3,
  quietAbsRms: 12, // -69 dBFS
  quietOverFloor: 4, // +12 dB
  voicedAbsRms: 24, // -63 dBFS
  voicedOverFloor: 8, // +18 dB
  minVoicedSec: 0.3,
};

/** int16 RMS/peak to dBFS (-120 for zero). */
export const dbfs = (v: number) => (v > 0 ? Math.round(20 * Math.log10(v / 32768) * 10) / 10 : -120);

export interface Chunk {
  /** Seconds from the start of this stream. */
  offsetSec: number;
  durationSec: number;
  pcm: Int16Array;
  /** Seconds of frames above the voiced threshold. */
  voicedSec: number;
  /** True when the chunk is (near) silence and should be skipped. */
  silent: boolean;
  peak: number;
  /** Whole-chunk RMS, loudest 20 ms frame RMS, the noise floor and the voiced threshold used (int16 units). */
  rms: number;
  maxFrameRms: number;
  noiseFloor: number;
  voicedRms: number;
}

/**
 * Noise floor = 10th percentile of frame RMS over the last ~10 s, at least 1. Percentile, not
 * minimum, so the exact-zero frames avfoundation emits while the mic warms up don't pin it to 0.
 */
class NoiseFloor {
  private ring = new Float64Array(500);
  private n = 0;
  add(r: number): void {
    this.ring[this.n % this.ring.length] = r;
    this.n++;
  }
  get value(): number {
    const k = Math.min(this.n, this.ring.length);
    if (k < 25) return 1;
    const a = Array.from(this.ring.subarray(0, k)).filter((v) => v > 0).sort((x, y) => x - y);
    if (a.length < 25) return 1;
    // Capped so a stream that opens with continuous speech can't push the gate above speech level.
    return Math.min(100, Math.max(1, a[Math.floor(a.length * 0.1)]));
  }
}

export function frameRms(pcm: Int16Array, start: number, len: number): number {
  let sum = 0;
  const end = Math.min(pcm.length, start + len);
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

export class Chunker {
  private buf: Int16Array = new Int16Array(SAMPLE_RATE * 16);
  private len = 0;
  private consumed = 0; // samples already emitted as chunks
  private carry: Buffer | null = null; // odd trailing byte between pushes
  private floor = new NoiseFloor();
  private floorPos = 0; // samples already fed to the floor tracker
  /** Total samples seen, and how many were exactly zero (macOS delivers zeros without permission). */
  totalSamples = 0;
  nonZeroSamples = 0;

  constructor(
    private onChunk: (c: Chunk) => void,
    private opts: ChunkerOptions = DEFAULT_CHUNKER,
  ) {}

  push(data: Buffer): void {
    if (this.carry) {
      data = Buffer.concat([this.carry, data]);
      this.carry = null;
    }
    if (data.length % 2) {
      this.carry = data.subarray(data.length - 1);
      data = data.subarray(0, data.length - 1);
    }
    const n = data.length / 2;
    if (!n) return;
    this.ensure(this.len + n);
    for (let i = 0; i < n; i++) {
      const v = data.readInt16LE(i * 2);
      this.buf[this.len + i] = v;
      if (v !== 0) this.nonZeroSamples++;
    }
    this.len += n;
    this.totalSamples += n;
    this.drain(false);
  }

  /** Emit whatever is buffered (end of stream). */
  flush(): void {
    this.drain(true);
  }

  private ensure(cap: number): void {
    if (cap <= this.buf.length) return;
    const next = new Int16Array(Math.max(cap, this.buf.length * 2));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  private quietRms(): number {
    return Math.max(this.opts.quietAbsRms, this.floor.value * this.opts.quietOverFloor);
  }

  /** Current voiced threshold (int16 RMS) for this stream. */
  voicedRms(): number {
    return Math.max(this.opts.voicedAbsRms, this.floor.value * this.opts.voicedOverFloor);
  }

  private drain(final: boolean): void {
    // Feed whole new frames to the noise-floor tracker (positions are relative to the buffer start).
    for (; this.floorPos + FRAME <= this.len; this.floorPos += FRAME) this.floor.add(frameRms(this.buf, this.floorPos, FRAME));
    const { minSec, maxSec, pauseSec } = this.opts;
    const quietRms = this.quietRms();
    const min = Math.round(minSec * SAMPLE_RATE);
    const max = Math.round(maxSec * SAMPLE_RATE);
    const pauseFrames = Math.max(1, Math.round((pauseSec * SAMPLE_RATE) / FRAME));
    for (;;) {
      if (this.len < min) break;
      let cut = -1;
      // Earliest pause after minSec: cut in its middle.
      let run = 0;
      for (let f = Math.floor(min / FRAME); (f + 1) * FRAME <= Math.min(this.len, max); f++) {
        if (frameRms(this.buf, f * FRAME, FRAME) <= quietRms) {
          run++;
          if (run >= pauseFrames) {
            cut = (f - Math.floor(run / 2)) * FRAME;
            break;
          }
        } else run = 0;
      }
      if (cut < 0 && this.len >= max) {
        // No pause within maxSec: cut at the quietest frame between minSec and maxSec.
        let best = Infinity;
        for (let f = Math.floor(min / FRAME); (f + 1) * FRAME <= max; f++) {
          const r = frameRms(this.buf, f * FRAME, FRAME);
          if (r < best) {
            best = r;
            cut = (f + 1) * FRAME;
          }
        }
      }
      if (cut < 0) break;
      this.emit(cut);
    }
    if (final && this.len > 0) this.emit(this.len);
  }

  private emit(n: number): void {
    const pcm = this.buf.slice(0, n);
    const offsetSec = this.consumed / SAMPLE_RATE;
    this.buf.copyWithin(0, n, this.len);
    this.len -= n;
    this.consumed += n;
    this.floorPos = Math.max(0, this.floorPos - n);
    const noiseFloor = this.floor.value;
    const voicedRms = this.voicedRms();
    let voiced = 0;
    let peak = 0;
    let maxFrameRms = 0;
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i += FRAME) {
      const r = frameRms(pcm, i, FRAME);
      if (r > maxFrameRms) maxFrameRms = r;
      if (r > voicedRms) voiced += Math.min(FRAME, pcm.length - i);
    }
    for (let i = 0; i < pcm.length; i++) {
      peak = Math.max(peak, Math.abs(pcm[i]));
      sumSq += pcm[i] * pcm[i];
    }
    const voicedSec = voiced / SAMPLE_RATE;
    this.onChunk({
      offsetSec,
      durationSec: n / SAMPLE_RATE,
      pcm,
      voicedSec,
      silent: voicedSec < this.opts.minVoicedSec || n < SAMPLE_RATE * 0.3,
      peak,
      rms: Math.sqrt(sumSq / Math.max(1, pcm.length)),
      maxFrameRms,
      noiseFloor,
      voicedRms,
    });
  }
}

/** A 16 kHz mono 16-bit PCM WAV file in memory. */
export function wavBytes(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

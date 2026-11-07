// Live Insights (FEATURES F24-F25): batches transcript segments and asks deepseek-flash for a
// rolling markdown summary plus clickable action items, emitted as `session:insights`.
import { createHash } from 'node:crypto';
import type { InsightAction, InsightActionKind, LiveInsights, TranscriptSegment } from '../shared/contract';
import { DeepSeekClient, parseJsonObject } from './deepseek';
import { INSIGHTS_SYSTEM } from './prompts';
import { transcriptTail } from '../sessions/store';

const KINDS: InsightActionKind[] = ['question', 'define', 'followUp', 'actionItem'];

/** Timing knobs (D-I5). */
export const INSIGHT_TIMING = {
  /** Wait this long after the last segment before calling the model... */
  debounceMs: 2000,
  /** ...but never longer than this after the first unprocessed segment. */
  maxWaitMs: 6000,
  /** Minimum gap between two model calls. */
  minIntervalMs: 4000,
  /** Transcript characters sent per call (most recent). */
  maxTranscriptChars: 30_000,
};

interface State {
  sessionId: string;
  segments: TranscriptSegment[];
  summaryMarkdown: string;
  actionItems: InsightAction[];
  /** Every item shown this session, so clicks on items that already scrolled away still resolve. */
  known: Map<string, InsightAction>;
  processed: number;
  firstPendingAt: number | null;
  timer?: NodeJS.Timeout;
  inFlight: AbortController | null;
  lastCallAt: number;
  calls: number;
  failures: number;
}

export interface InsightsDeps {
  client: DeepSeekClient;
  model(): string;
  emit(payload: LiveInsights): void;
  log(...args: unknown[]): void;
}

export const insightId = (kind: string, text: string) =>
  'ins_' + createHash('sha1').update(`${kind}|${text.toLowerCase().replace(/\W+/g, ' ').trim()}`).digest('hex').slice(0, 10);

export class LiveInsightsEngine {
  private s: State | null = null;

  constructor(private deps: InsightsDeps) {}

  get sessionId(): string | null {
    return this.s?.sessionId ?? null;
  }

  /** Looks up an action item the UI was shown (for `ask:ask` with source 'insight'). */
  getItem(id: string): InsightAction | undefined {
    return this.s?.known.get(id);
  }

  snapshot(): (LiveInsights & { calls: number }) | null {
    const s = this.s;
    return s ? { sessionId: s.sessionId, summaryMarkdown: s.summaryMarkdown, actionItems: s.actionItems, updatedAt: Date.now(), calls: s.calls } : null;
  }

  start(sessionId: string, priorSegments: TranscriptSegment[] = []): void {
    this.stop();
    this.s = {
      sessionId,
      segments: [...priorSegments],
      summaryMarkdown: '',
      actionItems: [],
      known: new Map(),
      processed: 0,
      firstPendingAt: null,
      inFlight: null,
      lastCallAt: 0,
      calls: 0,
      failures: 0,
    };
    // Idle state for the panel ("No content yet").
    this.deps.emit({ sessionId, summaryMarkdown: '', actionItems: [], updatedAt: Date.now() });
    if (priorSegments.length) this.schedule(0);
  }

  /** Adds earlier segments of a resumed session in front of anything already received. */
  seed(prior: TranscriptSegment[]): void {
    const s = this.s;
    if (!s) return;
    const have = new Set(s.segments.map((x) => x.id));
    const older = prior.filter((x) => x.sessionId === s.sessionId && !have.has(x.id));
    if (!older.length) return;
    s.segments = [...older, ...s.segments];
    s.processed = 0;
    this.schedule(0);
  }

  stop(sessionId?: string): void {
    const s = this.s;
    if (!s || (sessionId && s.sessionId !== sessionId)) return;
    clearTimeout(s.timer);
    s.inFlight?.abort();
    this.s = null;
  }

  add(seg: TranscriptSegment): void {
    const s = this.s;
    if (!s || seg.sessionId !== s.sessionId) return;
    const i = s.segments.findIndex((x) => x.id === seg.id);
    if (i >= 0) s.segments[i] = seg;
    else s.segments.push(seg);
    if (!seg.text.trim()) return;
    s.firstPendingAt ??= Date.now();
    const sinceFirst = Date.now() - s.firstPendingAt;
    this.schedule(Math.min(INSIGHT_TIMING.debounceMs, Math.max(0, INSIGHT_TIMING.maxWaitMs - sinceFirst)));
  }

  private schedule(delay: number): void {
    const s = this.s;
    if (!s || s.inFlight) return; // run() reschedules itself when the call finishes
    const gap = s.lastCallAt + INSIGHT_TIMING.minIntervalMs - Date.now();
    clearTimeout(s.timer);
    s.timer = setTimeout(() => void this.run(), Math.max(delay, gap, 0));
  }

  private async run(): Promise<void> {
    const s = this.s;
    if (!s || s.inFlight || s.segments.length === s.processed) return;
    const upto = s.segments.length;
    s.firstPendingAt = null;
    s.lastCallAt = Date.now();
    const ctrl = new AbortController();
    s.inFlight = ctrl;
    const prev = s.summaryMarkdown
      ? `PREVIOUS NOTES:\n${s.summaryMarkdown}\n\nPREVIOUS ACTIONS:\n${s.actionItems.map((a) => `- [${a.kind}] ${a.text}`).join('\n') || '(none)'}`
      : 'PREVIOUS NOTES: (none yet)';
    try {
      const res = await this.deps.client.chat({
        model: this.deps.model(),
        json: true,
        thinking: false,
        maxTokens: 1500,
        temperature: 0.3,
        signal: ctrl.signal,
        connectTimeoutMs: 20_000,
        totalTimeoutMs: 45_000,
        retries: 1,
        messages: [
          { role: 'system', content: INSIGHTS_SYSTEM },
          { role: 'user', content: `${prev}\n\nTRANSCRIPT SO FAR:\n<<<\n${transcriptTail(s.segments.slice(0, upto), INSIGHT_TIMING.maxTranscriptChars)}\n>>>\n\nReturn the updated JSON object.` },
        ],
      });
      if (this.s !== s) return; // session ended or restarted meanwhile
      const j = parseJsonObject<{ summaryMarkdown?: unknown; actions?: unknown }>(res.content);
      const items: InsightAction[] = [];
      for (const raw of Array.isArray(j.actions) ? j.actions : []) {
        const a = raw as { kind?: unknown; text?: unknown };
        if (typeof a.text !== 'string' || !a.text.trim()) continue;
        const kind = KINDS.includes(a.kind as InsightActionKind) ? (a.kind as InsightActionKind) : 'followUp';
        const text = a.text.trim().replace(/^❓\s*/, '');
        const id = insightId(kind, text);
        if (items.some((x) => x.id === id)) continue;
        const item = { id, kind, text };
        items.push(item);
        s.known.set(id, item);
        if (items.length >= 6) break;
      }
      s.summaryMarkdown = typeof j.summaryMarkdown === 'string' ? j.summaryMarkdown.trim() : s.summaryMarkdown;
      s.actionItems = items;
      s.processed = upto;
      s.calls++;
      s.failures = 0;
      this.deps.log(`insights #${s.calls} for ${s.sessionId}: ${upto} segments, ${items.length} actions, ${res.ms} ms, model=${res.model}`);
      this.deps.emit({ sessionId: s.sessionId, summaryMarkdown: s.summaryMarkdown, actionItems: s.actionItems, updatedAt: Date.now(), model: res.model });
    } catch (err) {
      if (!ctrl.signal.aborted) {
        s.failures++;
        this.deps.log(`insights call failed (${s.failures} in a row): ${(err as Error).message}`);
      }
    } finally {
      if (this.s === s) {
        s.inFlight = null;
        // Back off after failures (5 s, 10 s, 20 s ... up to 60 s) so a dead key doesn't spin.
        const backoff = s.failures ? Math.min(60_000, 5000 * 2 ** (s.failures - 1)) : INSIGHT_TIMING.debounceMs;
        if (s.segments.length > s.processed) this.schedule(backoff);
      }
    }
  }
}

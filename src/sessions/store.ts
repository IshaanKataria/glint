// On-disk session store: <dataDir>/<sessionId>/session.json + notes.md (+ transcript.jsonl while live).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionListItem, SessionRecord, SessionStatus, TranscriptSegment, UsageEntry } from '../shared/contract';

export type SessionFileStatus = 'recording' | 'summarizing' | 'saved' | 'summary_failed';

/** session.json. `transcript`/`durationSec` follow the Lead's brief; `durationMs` mirrors the contract. */
export interface SessionFile {
  version: 1;
  id: string;
  title: string;
  status: SessionFileStatus;
  startedAt: number;
  endedAt?: number;
  durationSec: number;
  durationMs: number;
  source?: SessionStatus['source'];
  transcript: TranscriptSegment[];
  summaryMarkdown?: string;
  actionItems: string[];
  usage: UsageEntry[];
  notesPath?: string;
  summaryModel?: string;
  summaryError?: string;
  /** Epoch ms of every (re)start of capture; length > 1 means the session was resumed. */
  runs: { startedAt: number; endedAt?: number }[];
}

/** History list row: the contract's SessionListItem plus display helpers for grouping by day. */
export interface HistoryListItem extends SessionListItem {
  status: SessionFileStatus;
  /** Local date key, e.g. "2026-11-06" (group rows by this). */
  dayKey: string;
  /** "Today", "Yesterday", or e.g. "Fri, Nov 6". */
  dayLabel: string;
  /** Local time, e.g. "5:48 PM". */
  timeLabel: string;
  /** Duration chip, e.g. "1:21" or "1:02:05". */
  durationLabel: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const speakerLabel = (s: TranscriptSegment['speaker']) => (s === 'me' ? 'Me' : 'Them');

/** "[0:05] Them: hello" lines, oldest first. */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${clock(s.tStart)}] ${speakerLabel(s.speaker)}: ${s.text.trim()}`).join('\n');
}

/** The last `maxChars` of the transcript, cut on a line boundary. */
export function transcriptTail(segments: TranscriptSegment[], maxChars: number): string {
  const full = transcriptText(segments);
  if (full.length <= maxChars) return full;
  const cut = full.slice(full.length - maxChars);
  return '[...earlier transcript omitted...]\n' + cut.slice(cut.indexOf('\n') + 1);
}

function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabelOf(ms: number, now = Date.now()): string {
  const k = dayKeyOf(ms);
  if (k === dayKeyOf(now)) return 'Today';
  if (k === dayKeyOf(now - 86_400_000)) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const timeLabelOf = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function defaultTitle(startedAt: number): string {
  return `Session ${new Date(startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export function renderNotes(f: SessionFile): string {
  const when = new Date(f.startedAt).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const out: string[] = [`# ${f.title}`, '', `${when} · ${clock(f.durationSec)} · ${f.usage.length} AI ${f.usage.length === 1 ? 'use' : 'uses'}`, ''];
  out.push('## Summary', '');
  if (f.summaryMarkdown) out.push(f.summaryMarkdown.trim());
  else out.push(`_No summary${f.summaryError ? `: ${f.summaryError}` : ''}._`);
  out.push('', '## Action items', '');
  if (f.actionItems.length) for (const a of f.actionItems) out.push(`- [ ] ${a}`);
  else out.push('_None._');
  out.push('', '## Transcript', '');
  if (f.transcript.length) for (const s of f.transcript) out.push(`**[${clock(s.tStart)}] ${speakerLabel(s.speaker)}:** ${s.text.trim()}`, '');
  else out.push('_No transcript._', '');
  if (f.usage.length) {
    out.push('## AI usage', '');
    for (const u of f.usage) {
      out.push(`### ${u.question}`, '', `_${timeLabelOf(u.at)} · ${u.model}${u.usedScreenshot ? ' · sent with screenshot' : ''}_`, '', u.answer.trim(), '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export class SessionStore {
  constructor(readonly dataDir: string) {}

  dir(id: string): string {
    if (!/^[\w.-]+$/.test(id) || id === '.' || id === '..') throw new Error(`invalid session id "${id}"`);
    return join(this.dataDir, id);
  }

  read(id: string): SessionFile | null {
    const p = join(this.dir(id), 'session.json');
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as SessionFile;
    } catch {
      return null;
    }
  }

  write(f: SessionFile): void {
    const dir = this.dir(f.id);
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, 'session.json.tmp');
    writeFileSync(tmp, JSON.stringify(f, null, 2));
    renameSync(tmp, join(dir, 'session.json'));
  }

  writeNotes(f: SessionFile): string {
    const p = join(this.dir(f.id), 'notes.md');
    writeFileSync(p, renderNotes(f));
    return p;
  }

  appendSegment(id: string, seg: TranscriptSegment): void {
    mkdirSync(this.dir(id), { recursive: true });
    appendFileSync(join(this.dir(id), 'transcript.jsonl'), JSON.stringify(seg) + '\n');
  }

  /** Every session.json in the data dir; skips files (settings.json) and unreadable folders. */
  all(): SessionFile[] {
    if (!existsSync(this.dataDir)) return [];
    const out: SessionFile[] = [];
    for (const name of readdirSync(this.dataDir)) {
      try {
        if (!statSync(join(this.dataDir, name)).isDirectory()) continue;
        const f = this.read(name);
        if (f && f.id) out.push(f);
      } catch {
        // skip unreadable entries
      }
    }
    return out;
  }

  static toListItem(f: SessionFile): HistoryListItem {
    return {
      id: f.id,
      title: f.title,
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      durationMs: f.durationMs,
      uses: f.usage.length,
      hasSummary: !!f.summaryMarkdown,
      status: f.status,
      dayKey: dayKeyOf(f.startedAt),
      dayLabel: dayLabelOf(f.startedAt),
      timeLabel: timeLabelOf(f.startedAt),
      durationLabel: clock(f.durationSec),
    };
  }

  static toRecord(f: SessionFile): SessionRecord & { status: SessionFileStatus; durationSec: number; summaryError?: string } {
    return {
      id: f.id,
      title: f.title,
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      durationMs: f.durationMs,
      durationSec: f.durationSec,
      source: f.source,
      segments: f.transcript,
      summaryMarkdown: f.summaryMarkdown,
      actionItems: f.actionItems,
      usage: f.usage,
      notesPath: f.notesPath,
      status: f.status,
      summaryError: f.summaryError,
    };
  }
}

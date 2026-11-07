// End-of-session notes (F51, F52, F56): title, sectioned summary and action items from the
// transcript. The model returns structured JSON (overview + sections[{heading, bullets}]);
// the markdown is built here, then validated, with one corrective retry (D-I8).
import type { TranscriptSegment, UsageEntry } from '../shared/contract';
import { DeepSeekClient, parseJsonObject, type ChatMessage } from '../ai/deepseek';
import { NOTES_SYSTEM } from '../ai/prompts';
import { transcriptTail } from './store';

/** Max transcript characters sent to the notes model (~100k tokens). */
export const NOTES_MAX_CHARS = 400_000;

export interface NotesSection {
  heading: string;
  bullets: string[];
}

export interface GeneratedNotes {
  title: string;
  overview: string;
  sections: NotesSection[];
  summaryMarkdown: string;
  actionItems: string[];
  model: string;
  attempts: number;
  /** Problems left after the last attempt (empty when the notes passed validation). */
  issues: string[];
  ms: number;
  usage: { promptTokens: number; completionTokens: number };
}

export interface NotesInput {
  transcript: TranscriptSegment[];
  startedAt: number;
  durationSec: number;
  usage?: UsageEntry[];
  model: string;
  /** Model thinking for the notes call. Default false (D-I1, D-I8). */
  thinking?: boolean;
  log?: (...a: unknown[]) => void;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Strips markdown the model may add itself, so the code owns the structure. */
const cleanHeading = (s: string) => s.replace(/^#+\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').replace(/[:.]\s*$/, '').trim();
const cleanBullet = (s: string) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();

/** `[{task, owner}]` -> "task (owner)" strings (session.json keeps string[]); plain strings pass through. */
export function parseActionItems(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const it of v) {
    if (typeof it === 'string') {
      const t = cleanBullet(it.trim());
      if (t) out.push(t);
      continue;
    }
    const o = (it ?? {}) as Record<string, unknown>;
    const task = cleanBullet(str(o.task)).replace(/\s*\([^)]*\)\s*$/, '').replace(/\.$/, '');
    const owner = str(o.owner).replace(/^\(|\)$/g, '');
    if (task) out.push(owner ? `${task} (${owner})` : task);
  }
  return out;
}

export function parseNotes(raw: string): Omit<GeneratedNotes, 'summaryMarkdown' | 'model' | 'attempts' | 'issues' | 'ms' | 'usage'> & { legacySummary?: string } {
  const j = parseJsonObject<Record<string, unknown>>(raw);
  const sections: NotesSection[] = [];
  for (const s of Array.isArray(j.sections) ? j.sections : []) {
    const o = (s ?? {}) as Record<string, unknown>;
    const heading = cleanHeading(str(o.heading));
    const bullets = strList(o.bullets).map(cleanBullet).filter(Boolean);
    if (heading && bullets.length) sections.push({ heading, bullets });
  }
  return {
    title: str(j.title).replace(/^["']|["'.]$/g, ''),
    overview: str(j.overview),
    sections,
    actionItems: parseActionItems(j.actionItems),
    legacySummary: str(j.summaryMarkdown) || undefined,
  };
}

/** Overview paragraph, then one `### Heading` + bullets per section (renders as a section heading in the dashboard and nests under notes.md's "## Summary"). */
export function notesMarkdown(overview: string, sections: NotesSection[]): string {
  const parts: string[] = [];
  if (overview) parts.push(overview);
  for (const s of sections) parts.push(`### ${s.heading}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`);
  return parts.join('\n\n');
}

/** Distinct numbers written as digits in the transcript ("$57,600" -> "57600", "81%" -> "81"). */
export function numericFacts(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, '').replace(/\.0+$/, '');
    if (n.length) out.add(n);
  }
  return [...out];
}

const words = (segs: TranscriptSegment[]) => segs.reduce((n, s) => n + s.text.trim().split(/\s+/).filter(Boolean).length, 0);

/** Sections expected for a transcript of this many words: short chats may have one, real meetings need two or more. */
export function minSections(wordCount: number): number {
  return wordCount >= 120 ? 2 : 1;
}

export function validateNotes(
  n: { overview: string; sections: NotesSection[]; actionItems: string[] },
  transcript: TranscriptSegment[],
): string[] {
  const issues: string[] = [];
  const wc = words(transcript);
  if (!n.overview) issues.push('"overview" is empty');
  const need = minSections(wc);
  if (n.sections.length < need) issues.push(`only ${n.sections.length} section(s) with bullets; this ${wc}-word conversation needs at least ${need} topic sections, each with bullets`);
  const facts = numericFacts(transcript.map((s) => s.text).join(' '));
  if (facts.length >= 4) {
    const notesNums = new Set(numericFacts([n.overview, ...n.sections.flatMap((s) => [s.heading, ...s.bullets]), ...n.actionItems].join(' ')));
    const missing = facts.filter((f) => !notesNums.has(f));
    // At least 60% of the figures said in the meeting must appear in the notes.
    if (missing.length > facts.length * 0.4) issues.push(`these figures from the transcript are missing from the notes: ${missing.join(', ')}`);
  }
  return issues;
}

/** Tells the model how the labels split, so "all Them" (user's voice not captured separately) is explicit. */
export function speakerNote(segs: TranscriptSegment[]): string {
  const me = segs.filter((x) => x.speaker === 'me').length;
  const them = segs.length - me;
  if (!me) return `Speaker labels: all ${them} lines are labelled "Them" (the user's own voice was not captured separately; people may still be distinguishable by content).`;
  if (!them) return `Speaker labels: all ${me} lines are labelled "Me" (the user).`;
  return `Speaker labels: ${me} lines "Me" (the user), ${them} lines "Them".`;
}

export async function generateNotes(client: DeepSeekClient, input: NotesInput): Promise<GeneratedNotes> {
  const t0 = Date.now();
  const usageLines = input.usage?.length
    ? `\n\nAI questions the user asked during the session (context only, do not summarise them as meeting content):\n${input.usage.map((u) => `- ${u.question}`).join('\n')}`
    : '';
  const wc = words(input.transcript);
  const messages: ChatMessage[] = [
    { role: 'system', content: NOTES_SYSTEM },
    {
      role: 'user',
      content: `Session started ${new Date(input.startedAt).toString()}, length ${Math.max(1, Math.round(input.durationSec / 60))} min, ${input.transcript.length} transcript lines, ${wc} words. ${speakerNote(input.transcript)} Use ${minSections(wc) === 1 ? '1 or 2 sections' : 'at least 2 sections'}.\n\nTRANSCRIPT:\n<<<\n${transcriptTail(input.transcript, NOTES_MAX_CHARS)}\n>>>${usageLines}\n\nReturn the JSON object.`,
    },
  ];
  const usage = { promptTokens: 0, completionTokens: 0 };
  let best: (ReturnType<typeof parseNotes> & { issues: string[]; model: string }) | null = null;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    const r = await client.chat({
      model: input.model,
      json: true,
      thinking: !!input.thinking,
      maxTokens: 6000,
      temperature: 0.2,
      totalTimeoutMs: 240_000,
      retries: 2,
      messages,
    });
    usage.promptTokens += r.usage?.promptTokens ?? 0;
    usage.completionTokens += r.usage?.completionTokens ?? 0;
    let parsed: ReturnType<typeof parseNotes>;
    try {
      parsed = parseNotes(r.content);
    } catch {
      parsed = { title: '', overview: '', sections: [], actionItems: [] };
    }
    const issues = validateNotes(parsed, input.transcript);
    const score = (x: { issues: string[]; sections: NotesSection[] }) => -x.issues.length * 100 + x.sections.length;
    const cand = { ...parsed, issues, model: r.model };
    if (!best || score(cand) > score(best)) best = cand;
    input.log?.(`notes attempt ${attempts}: ${parsed.sections.length} sections, ${issues.length ? 'issues: ' + issues.join('; ') : 'valid'}`);
    if (!issues.length) break;
    messages.push(
      { role: 'assistant', content: r.content },
      { role: 'user', content: `That JSON does not meet the requirements: ${issues.join('; ')}. Return the corrected full JSON object with the same keys. Use only what was said in the transcript; do not invent anything.` },
    );
  }
  const b = best!;
  // Last resort: an old-style markdown string if the model ignored the sections schema twice.
  const summaryMarkdown = b.sections.length || b.overview ? notesMarkdown(b.overview, b.sections) : (b.legacySummary ?? '');
  return {
    title: b.title,
    overview: b.overview,
    sections: b.sections,
    summaryMarkdown,
    actionItems: b.actionItems,
    model: b.model,
    attempts,
    issues: b.issues,
    ms: Date.now() - t0,
    usage,
  };
}

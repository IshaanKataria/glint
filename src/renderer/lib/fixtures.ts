/**
 * DEV-ONLY VISUAL FIXTURES (UI agent). NOT PROOF OF ANY FEATURE.
 *
 * Used only by scripts/ui_shots.mjs to put the renderer into states whose backend (AI, Audio,
 * sessions) may not exist yet, so the layout can be compared with research/screens/*.png.
 * Active only when BOTH `window.glint.testMode` (GLINT_TEST=1) is true AND the page URL has
 * `?fixture=<name>`. All data below is invented sample text, never shown in normal use.
 */
import type {
  AskDoneEvent,
  AskErrorEvent,
  AskStatusEvent,
  AskChunkEvent,
  LiveInsights,
  SessionListItem,
  SessionRecord,
  SessionStatus,
  TranscriptSegment,
} from '../../shared/contract';

export function fixtureParams(): { name: string; scene: string | null; zoom: number } | null {
  const q = new URLSearchParams(location.search);
  const name = q.get('fixture');
  if (!name || !window.glint?.testMode) return null;
  return { name, scene: q.get('scene'), zoom: Number(q.get('zoom')) || 1 };
}

/** Puts a fake video-call backdrop behind the overlay so translucency can be judged (fixture only). */
export function mountScene(kind: string, zoom = 1): void {
  document.documentElement.classList.add('fixture-scene', `scene-${kind}`);
  // The reference video frames are zoomed in ~1.4x; CSS zoom reproduces that framing in the shot.
  if (zoom !== 1) document.documentElement.style.zoom = String(zoom);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'fixture-scene.css';
  document.head.append(link);
  const scene = document.createElement('div');
  scene.className = 'fx-scene';
  scene.innerHTML =
    '<div class="fx-tile"><div class="fx-wall"></div><div class="fx-plant"></div><div class="fx-person"><i class="fx-hair"></i><i class="fx-face"></i><i class="fx-body"></i></div><span class="fx-name">Jordan Lee</span></div>' +
    '<div class="fx-self"><span class="fx-name">You</span></div>';
  document.body.prepend(scene);
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

export interface OverlayDriver {
  sessionStatus(s: SessionStatus): void;
  segment(s: TranscriptSegment): void;
  insights(i: LiveInsights): void;
  askBegin(label: string, requestId: string): void;
  askStatus(e: AskStatusEvent): void;
  askChunk(e: AskChunkEvent): void;
  askDone(e: AskDoneEvent): void;
  askError(e: AskErrorEvent): void;
  openComposer(): void;
  showTranscript(on: boolean): void;
  highlightAction(index: number): void;
}

const SID = 'fx-session';
const rec = (startedAgoMs: number): SessionStatus => ({
  state: 'recording',
  sessionId: SID,
  startedAt: Date.now() - startedAgoMs,
  source: 'mic+system',
});

const SEGMENTS: Array<[TranscriptSegment['speaker'], string]> = [
  ['them', 'Thanks for making time. We looked at the proposal and the main question is the rollout timeline.'],
  ['me', 'Sure. We planned a two-phase rollout, pilot team first and then the rest of support.'],
  ['them', 'How long does the pilot usually run before you expand it?'],
  ['me', 'Usually four to six weeks, depending on how quickly the team adopts it.'],
  ['them', 'And what does pricing look like if we go past fifty seats? Is there a volume tier?'],
];

const LIVE_SUMMARY = `**Rollout Timeline**
- Two-phase rollout: pilot team first, then the wider support org
- Pilot typically runs 4 to 6 weeks before expanding

**Pricing Questions**
- Asked about pricing beyond fifty seats
  - Wants to know whether a volume tier exists`;

const ANSWER = `They're asking two things: how long the pilot runs and whether pricing changes past fifty seats. Answer the timeline first, briefly, then move to pricing with a clear number so it doesn't sound evasive.

Here's how you could move the conversation forward:

"The pilot usually runs four to six weeks. For anything above fifty seats we have a volume tier, so the per-seat price drops. I can send you the exact breakdown after this call."

**Follow-up you could ask:** what does success look like for the pilot team, so you both agree on when to expand?`;

export function runOverlayFixture(name: string, d: OverlayDriver): void {
  const segs = (n: number) =>
    SEGMENTS.slice(0, n).forEach(([speaker, text], i) =>
      d.segment({ sessionId: SID, id: `s${i}`, speaker, text, tStart: i * 6, tEnd: i * 6 + 5 }),
    );
  const emptyInsights: LiveInsights = { sessionId: SID, summaryMarkdown: '', actionItems: [], updatedAt: Date.now() };
  const liveInsights: LiveInsights = {
    sessionId: SID,
    summaryMarkdown: LIVE_SUMMARY,
    actionItems: [
      { id: 'q1', kind: 'question', text: 'What does pricing look like past fifty seats?' },
      { id: 'q2', kind: 'question', text: 'How long does the pilot usually run?' },
      { id: 'd1', kind: 'define', text: 'Define volume tier' },
    ],
    updatedAt: Date.now(),
  };

  switch (name) {
    case 'bar-idle':
      d.sessionStatus({ state: 'idle' });
      break;
    case 'bar-recording': // overlay-bar.png: recording just started, empty summary
      d.sessionStatus(rec(7_000));
      d.insights(emptyInsights);
      break;
    case 'insights-idle': // live-suggestions.png: transcript started, summary not written yet
      d.sessionStatus(rec(64_000));
      segs(1);
      d.insights(emptyInsights);
      d.highlightAction(0);
      break;
    case 'insights-live':
      d.sessionStatus(rec(184_000));
      segs(5);
      d.insights(liveInsights);
      break;
    case 'transcript':
      d.sessionStatus(rec(184_000));
      segs(5);
      d.insights(liveInsights);
      d.showTranscript(true);
      break;
    case 'composer':
      d.sessionStatus({ state: 'idle' });
      d.openComposer();
      break;
    case 'ask-analyzing':
      d.sessionStatus({ state: 'idle' });
      d.askBegin('Assist', 'fx-1');
      d.askStatus({ requestId: 'fx-1', stage: 'capturing' });
      break;
    case 'ask-thinking':
      d.sessionStatus({ state: 'idle' });
      d.askBegin('What should I say?', 'fx-1');
      d.askStatus({ requestId: 'fx-1', stage: 'ocr' });
      d.askStatus({ requestId: 'fx-1', stage: 'thinking' });
      break;
    case 'ask-streaming':
      d.sessionStatus({ state: 'idle' });
      d.askBegin('Assist', 'fx-1');
      d.askStatus({ requestId: 'fx-1', stage: 'capturing' });
      d.askStatus({ requestId: 'fx-1', stage: 'streaming' });
      d.askChunk({ requestId: 'fx-1', delta: ANSWER.slice(0, 220) });
      break;
    case 'ask-answer': // ask-answer.png
      d.sessionStatus({ state: 'idle' });
      d.askBegin('Assist', 'fx-1');
      d.askStatus({ requestId: 'fx-1', stage: 'capturing' });
      d.askStatus({ requestId: 'fx-1', stage: 'streaming' });
      d.askChunk({ requestId: 'fx-1', delta: ANSWER });
      d.askDone({
        requestId: 'fx-1',
        answer: ANSWER,
        meta: {
          requestId: 'fx-1', kind: 'assist', question: 'Assist', usedScreenshot: true, ocrChars: 812,
          model: 'deepseek-v4-pro', startedAt: Date.now() - 4000, finishedAt: Date.now(),
        },
      });
      break;
    case 'ask-error':
      d.sessionStatus({ state: 'idle' });
      d.askBegin('What is on my screen?', 'fx-1');
      d.askError({ requestId: 'fx-1', error: { code: 'NOT_IMPLEMENTED', message: 'ask:ask is not implemented yet' } });
      break;
    default:
      console.warn(`[fixture] unknown overlay fixture ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
function at(daysAgo: number, h: number, m: number): number {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const LIST: Array<[string, number, number, number, number, number]> = [
  // title, daysAgo, hour, minute, duration min, uses
  ['Northwind pilot rollout and pricing', 0, 14, 5, 22.3, 5],
  ['Weekly design critique', 0, 10, 30, 41.1, 2],
  ['Hiring sync: support lead role', 1, 16, 0, 18.6, 0],
  ['Q4 roadmap review', 1, 11, 15, 52.4, 9],
  ['Onboarding call with Halcyon Labs', 3, 15, 40, 33.9, 4],
  ['Customer interview: Priya (ops)', 3, 9, 5, 27.2, 3],
  ['Budget planning', 4, 13, 20, 11.1, 1],
];

export function fixtureHistory(name: string): SessionListItem[] {
  if (name === 'empty') return [];
  return LIST.map(([title, d, hh, mm, dur, uses], i) => ({
    id: `fx-${i}`,
    title,
    startedAt: at(d, hh, mm),
    endedAt: at(d, hh, mm) + dur * 60_000,
    durationMs: dur * 60_000,
    uses,
    hasSummary: true,
  }));
}

export function fixtureRecord(id: string): SessionRecord {
  const item = fixtureHistory('history').find((s) => s.id === id) ?? fixtureHistory('history')[0];
  const segments: TranscriptSegment[] = [...SEGMENTS, ...SEGMENTS.slice(0, 3)].map(([speaker, text], i) => ({
    sessionId: item.id, id: `t${i}`, speaker, text, tStart: 4 + i * 9, tEnd: 4 + i * 9 + 7,
  }));
  return {
    id: item.id,
    title: item.title,
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    durationMs: item.durationMs,
    source: 'mic+system',
    segments,
    actionItems: [
      'Send Northwind the volume-tier pricing breakdown for 50+ seats.',
      'Agree on pilot success criteria with their support lead before kickoff.',
      'Schedule the pilot kickoff for the week of the 17th.',
      'Share the two-phase rollout plan as a one-page doc.',
    ],
    summaryMarkdown: `## Overview
Northwind is ready to pilot with one support team and wants clarity on the rollout timeline and pricing past fifty seats.

## Rollout
- Two phases: a pilot team first, then the wider support org.
- Pilot runs **4 to 6 weeks**, depending on adoption.

## Pricing
- Asked whether a **volume tier** applies above fifty seats.
- We confirmed per-seat pricing drops past fifty and promised a written breakdown.`,
    usage: [
      { requestId: 'u1', kind: 'assist', question: 'Assist', answer: 'They are asking about the pilot length and volume pricing. Answer the timeline first...', usedScreenshot: true, ocrChars: 812, model: 'deepseek-v4-pro', at: item.startedAt + 6 * 60_000 },
      { requestId: 'u2', kind: 'ask', question: 'What is a typical pilot success metric for support teams?', answer: 'Common ones: first-response time, resolution time, CSAT, and the share of tickets handled with the new workflow...', usedScreenshot: false, ocrChars: 0, model: 'deepseek-v4-pro', at: item.startedAt + 11 * 60_000 },
      { requestId: 'u3', kind: 'recap', question: 'Recap', answer: 'So far: two-phase rollout, 4 to 6 week pilot, open question on volume pricing past fifty seats.', usedScreenshot: false, ocrChars: 0, model: 'deepseek-v4-pro', at: item.startedAt + 17 * 60_000 },
    ],
  };
}

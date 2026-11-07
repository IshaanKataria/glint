// Glint overlay renderer: hotkey bar, status strip, Live Insights and the Ask panel.
import {
  AudioLines, ArrowDown, ChevronUp, EllipsisVertical, Image, MessageSquareText, Minus, RotateCw,
  SendHorizontal, Sparkles, WandSparkles, X, type IconNode,
} from 'lucide';
import type {
  AskDoneEvent, AskErrorEvent, AskOptions, AskStatusEvent, AskChunkEvent, AskStage, InsightAction,
  LiveInsights, QuickActionKind, Result, SessionStatus, TranscriptSegment,
} from '../shared/contract';
import { $, errorText, glintMark, h, icon } from './lib/dom';
import { setMarkdown } from './lib/md';
import { fmtTimer } from './lib/format';
import { fixtureParams, mountScene, runOverlayFixture, type OverlayDriver } from './lib/fixtures';

const g = window.glint;
// 540px ask panel + 24px each side: room for the widest shadow so it is never cut at the window edge.
const WINDOW_WIDTH = 588;

// ---------- Icons ----------
const ICONS: Record<string, IconNode> = {
  AudioLines, ArrowDown, ChevronUp, EllipsisVertical, Image, MessageSquareText, Minus, RotateCw,
  SendHorizontal, Sparkles, WandSparkles, X,
};
const ICON_SIZE: Record<string, number> = { EllipsisVertical: 16, Image: 14, SendHorizontal: 14, ArrowDown: 15, X: 12, Minus: 14 };
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  const name = el.dataset.icon!;
  const node = ICONS[name];
  if (!node) return;
  const chip = !!el.closest('.chip');
  const size = ICON_SIZE[name] ?? (el.closest('.bar') ? 15 : chip ? 14 : 15);
  const stroke = name === 'EllipsisVertical' ? 2.6 : name === 'SendHorizontal' ? 2.2 : chip ? 1.5 : 1.75;
  el.append(icon(node, size, stroke));
});
$('#status-spin').append(glintMark(12));

// ---------- Elements ----------
const root = $('#root');
const bar = $('#bar');
const listenBtn = $<HTMLButtonElement>('#listen');
const stopBtn = $<HTMLButtonElement>('#stop');
const statusEl = $('#status');
const statusText = $('#status-text');
const insights = $('#insights');
const insSummary = $('#ins-summary');
const insActionsWrap = $('#ins-actions-wrap');
const insActions = $('#ins-actions');
const insTranscript = $('#ins-transcript-view');
const insTranscriptLabel = $('#ins-transcript-label');
const insScroll = $('#ins-scroll');
const insFoot = $('#ins-foot');
const askp = $('#askp');
const askScroll = $('#ask-scroll');
const qBubble = $('#q-bubble');
const shotNote = $('#shot-note');
const askWait = $('#ask-wait');
const answerEl = $('#answer');
const askError = $('#ask-error');
const toBottom = $<HTMLButtonElement>('#to-bottom');
const input = $<HTMLInputElement>('#input');

// ---------- State ----------
type AskMode = 'hidden' | 'composer' | 'answer';
const state = {
  session: { state: 'idle' } as SessionStatus,
  insightsMin: false,
  showTranscript: false,
  segments: [] as TranscriptSegment[],
  insights: null as LiveInsights | null,
  ask: {
    mode: 'hidden' as AskMode,
    requestId: null as string | null,
    awaiting: false,
    text: '',
    streaming: false,
    stage: null as AskStage | null,
  },
};
const isLive = () => ['starting', 'recording', 'stopping', 'summarizing'].includes(state.session.state);

// ---------- Status strip ----------
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let sessionNote: { text: string; kind: 'busy' | 'ok' | 'error' | 'info'; onClick?: () => void } | null = null;

function renderStatus(): void {
  clearTimeout(statusTimer);
  const stage = state.ask.stage;
  let text: string | null = null;
  let kind: 'busy' | 'ok' | 'error' | 'info' = 'busy';
  let onClick: (() => void) | undefined;
  if (stage === 'capturing' || stage === 'ocr') text = 'Analyzing screen...';
  else if (stage === 'thinking') text = 'Thinking...';
  else if (sessionNote) ({ text, kind, onClick } = sessionNote);
  statusEl.hidden = !text;
  statusText.textContent = text ?? '';
  statusEl.className = `status ${kind}${onClick ? ' clickable' : ''}`;
  statusEl.onclick = onClick ?? null;
}

function flashSession(text: string, kind: 'busy' | 'ok' | 'error' | 'info', ms = 0, onClick?: () => void): void {
  sessionNote = { text, kind, onClick };
  renderStatus();
  if (ms) {
    const mine = sessionNote;
    setTimeout(() => {
      if (sessionNote === mine) {
        sessionNote = null;
        renderStatus();
      }
    }, ms);
  }
}

function ok<T>(r: Result<T>, prefix = ''): r is { ok: true; value: T } {
  if (!r.ok) flashSession(`${prefix}${errorText(r)}`, 'error', 7000);
  return r.ok;
}

// ---------- Session / listen ----------
let tick: ReturnType<typeof setInterval> | undefined;

function renderSession(): void {
  const s = state.session;
  const live = isLive();
  listenBtn.classList.toggle('live', s.state === 'recording');
  listenBtn.classList.toggle('collapsed', live && state.insightsMin);
  listenBtn.title = live ? (state.insightsMin ? 'Show Live Insights' : 'Hide Live Insights') : 'Start listening (⌘⇧\\)';
  stopBtn.hidden = !live;
  // Elapsed time lives in the stop button's tooltip, so the bar stays as compact as the reference.
  clearInterval(tick);
  stopBtn.title = 'Stop session (⌘⇧\\)';
  if (live && s.startedAt) {
    const upd = () => (stopBtn.title = `Stop session (⌘⇧\\) · ${fmtTimer(Date.now() - (s.startedAt ?? Date.now()))} elapsed`);
    upd();
    tick = setInterval(upd, 1000);
  }
  renderInsights();
}

function onSessionStatus(s: SessionStatus): void {
  const prev = state.session;
  const newSession = s.sessionId && s.sessionId !== prev.sessionId;
  state.session = s;
  if (newSession) {
    state.segments = [];
    state.insights = null;
    state.insightsMin = false;
  }
  switch (s.state) {
    case 'starting':
      flashSession(s.message ?? 'Connecting audio...', 'busy');
      break;
    case 'recording':
      if (prev.state !== 'recording')
        flashSession(s.source === 'file' ? 'Glint is listening to the audio file...' : 'Glint is listening...', 'info', 3500);
      break;
    case 'stopping':
      flashSession(s.message ?? 'Finishing transcription...', 'busy');
      break;
    case 'summarizing':
      flashSession(s.message ?? 'Writing your notes...', 'busy');
      break;
    case 'saved': {
      const id = s.sessionId;
      flashSession('Notes saved · Open in Glint', 'ok', 8000, () => void g.app.openDashboard({ view: 'history', sessionId: id }));
      break;
    }
    case 'error':
      flashSession(s.message ?? 'Session error', 'error', 9000);
      break;
    default:
      if (sessionNote?.kind === 'busy') {
        sessionNote = null;
        renderStatus();
      }
  }
  renderSession();
}

listenBtn.addEventListener('click', async () => {
  if (isLive()) {
    state.insightsMin = !state.insightsMin;
    renderSession();
    return;
  }
  flashSession('Connecting audio...', 'busy');
  const r = await g.session.start();
  if (ok(r, "Couldn't start listening: ")) onSessionStatus(r.value);
});
stopBtn.addEventListener('click', async () => {
  const r = await g.session.stop();
  if (ok(r, "Couldn't stop: ")) onSessionStatus(r.value);
});

// ---------- Live Insights ----------
const ACTION_EMOJI: Record<InsightAction['kind'], string> = { question: '❓', define: '💬', followUp: '💬', actionItem: '📝' };
const FOLLOW_UP: InsightAction = { id: '__followups', kind: 'followUp', text: 'Suggest follow-up questions' };

function renderInsights(): void {
  const show = isLive() && !state.insightsMin && state.ask.mode !== 'answer';
  insights.hidden = !show;
  if (!show) return;
  insTranscriptLabel.textContent = state.showTranscript ? 'Hide Transcript' : 'Show Transcript';
  insSummary.hidden = state.showTranscript;
  insTranscript.hidden = !state.showTranscript;
  insFoot.hidden = state.showTranscript;

  if (state.showTranscript) {
    renderTranscript();
    insActionsWrap.hidden = true;
    return;
  }
  const md = state.insights?.summaryMarkdown?.trim();
  insSummary.classList.toggle('idle', !md);
  if (md) {
    setMarkdown(insSummary, md);
    insSummary.querySelectorAll('p').forEach((p) => {
      const only = p.children.length === 1 && p.firstElementChild?.tagName === 'STRONG';
      if (only && p.textContent?.trim() === p.firstElementChild?.textContent?.trim()) p.classList.add('h');
    });
  }
  else insSummary.replaceChildren(h('h3', { text: 'Start of Summary' }), h('ul', {}, h('li', { text: 'No content yet...' })));

  const items = [...(state.insights?.actionItems ?? [])];
  // Cluely shows "Suggest follow-up questions" once the conversation has started (live-suggestions.png).
  if ((state.segments.length || items.length) && !items.some((a) => a.kind === 'followUp')) items.push(FOLLOW_UP);
  insActionsWrap.hidden = items.length === 0;
  insActions.replaceChildren(
    ...items.map((a) =>
      h('li', {}, h('button.ins-act', { type: 'button', onclick: () => void askInsight(a) }, h('span.emo', { text: ACTION_EMOJI[a.kind] }), a.text)),
    ),
  );
  updateInsFade();
}

function renderTranscript(): void {
  const atBottom = insScroll.scrollHeight - insScroll.scrollTop - insScroll.clientHeight < 24;
  if (!state.segments.length) {
    insTranscript.replaceChildren(h('div.ins-empty', { text: 'Waiting for speech...' }));
  } else {
    insTranscript.replaceChildren(
      ...state.segments.slice(-80).map((s) =>
        h(`div.seg.${s.speaker}`, {}, h('span.who', { text: s.speaker === 'me' ? 'Me' : 'Them' }), h('div.bubble', { text: s.text })),
      ),
    );
  }
  if (atBottom) insScroll.scrollTop = insScroll.scrollHeight;
  updateInsFade();
}

function updateInsFade(): void {
  insScroll.classList.toggle('fade', insScroll.scrollTop > 4);
}
insScroll.addEventListener('scroll', updateInsFade, { passive: true });

$('#ins-transcript').addEventListener('click', () => {
  state.showTranscript = !state.showTranscript;
  renderInsights();
  if (state.showTranscript) insScroll.scrollTop = insScroll.scrollHeight;
});
$('#ins-min').addEventListener('click', () => {
  state.insightsMin = true;
  renderSession();
});

function askInsight(a: InsightAction): void {
  if (a.id === FOLLOW_UP.id) void sendQuick('followUps', 'Follow-up questions', { source: 'insight' });
  else void sendAsk(a.text, { source: 'insight', insightId: a.id }, `${ACTION_EMOJI[a.kind]} ${a.text}`);
}

// ---------- Ask panel ----------
let pendingRender = 0;

function setAskMode(mode: AskMode): void {
  state.ask.mode = mode;
  askp.hidden = mode === 'hidden';
  askp.classList.toggle('composer-only', mode === 'composer');
  renderInsights();
}

function openComposer(focus = true): void {
  if (state.ask.mode === 'hidden') setAskMode('composer');
  if (focus) {
    void g.overlay.focus();
    requestAnimationFrame(() => input.focus());
  }
}

function beginExchange(label: string): void {
  if (state.ask.requestId && state.ask.streaming) void g.ask.cancel(state.ask.requestId);
  state.ask.requestId = null;
  state.ask.awaiting = true;
  state.ask.text = '';
  state.ask.streaming = false;
  state.ask.stage = null;
  qBubble.textContent = label;
  qBubble.title = label;
  shotNote.hidden = true;
  askError.hidden = true;
  answerEl.replaceChildren();
  answerEl.classList.remove('streaming');
  askWait.hidden = false;
  setAskMode('answer');
  askScroll.scrollTop = 0;
  updateAskScroll();
}

/** Accept an event for the current request. Events can arrive before invoke() resolves with the id. */
function accept(requestId: string): boolean {
  if (requestId === state.ask.requestId) return true;
  if (state.ask.awaiting && state.ask.requestId === null) {
    state.ask.requestId = requestId;
    return true;
  }
  return false;
}

async function run(label: string, call: () => Promise<Result<{ requestId: string }>>): Promise<void> {
  beginExchange(label);
  renderStatus();
  const r = await call();
  state.ask.awaiting = false;
  if (!r.ok) {
    showAskError(errorText(r));
    return;
  }
  state.ask.requestId ??= r.value.requestId;
}

function sendAsk(question: string, options: AskOptions, label = question): Promise<void> {
  return run(label, () => g.ask.ask(question, options));
}

const QUICK_LABEL: Record<QuickActionKind, string> = {
  assist: 'Assist', whatShouldISay: 'What should I say?', followUps: 'Follow-up questions', recap: 'Recap',
};
function sendQuick(kind: QuickActionKind, label = QUICK_LABEL[kind], options: AskOptions = { source: 'chip' }): Promise<void> {
  return run(label, () => g.ask.quick(kind, options));
}

function submitInput(source: AskOptions['source'] = 'input'): void {
  const text = input.value.trim();
  input.value = '';
  if (text) void sendAsk(text, { source });
  else void sendQuick('assist', 'Assist', { source });
}

function showAskError(msg: string): void {
  state.ask.stage = null;
  state.ask.streaming = false;
  askWait.hidden = true;
  answerEl.classList.remove('streaming');
  askError.hidden = false;
  askError.textContent = msg;
  renderStatus();
  updateAskScroll();
}

function renderAnswer(): void {
  pendingRender = 0;
  const stick = askScroll.scrollHeight - askScroll.scrollTop - askScroll.clientHeight < 40;
  setMarkdown(answerEl, state.ask.text);
  answerEl.classList.toggle('streaming', state.ask.streaming);
  if (stick && state.ask.streaming) askScroll.scrollTop = askScroll.scrollHeight;
  updateAskScroll();
}

function updateAskScroll(): void {
  const more = askScroll.scrollHeight - askScroll.scrollTop - askScroll.clientHeight > 8;
  askScroll.classList.toggle('more', more);
  toBottom.hidden = !more || state.ask.mode !== 'answer';
}
askScroll.addEventListener('scroll', updateAskScroll, { passive: true });
toBottom.addEventListener('click', () => askScroll.scrollTo({ top: askScroll.scrollHeight, behavior: 'smooth' }));

function onAskStatus(e: AskStatusEvent): void {
  if (!accept(e.requestId)) return;
  state.ask.stage = e.stage === 'streaming' ? null : e.stage;
  if (e.stage === 'capturing' || e.stage === 'ocr') shotNote.hidden = false;
  renderStatus();
}
function onAskChunk(e: AskChunkEvent): void {
  if (!accept(e.requestId)) return;
  state.ask.stage = null;
  state.ask.streaming = true;
  state.ask.text += e.delta;
  askWait.hidden = true;
  renderStatus();
  if (!pendingRender) pendingRender = requestAnimationFrame(renderAnswer);
}
function onAskDone(e: AskDoneEvent): void {
  if (!accept(e.requestId)) return;
  state.ask.stage = null;
  state.ask.streaming = false;
  state.ask.awaiting = false;
  state.ask.text = e.answer;
  askWait.hidden = true;
  shotNote.hidden = !e.meta.usedScreenshot;
  if (e.meta.usedScreenshot) shotNote.title = `${e.meta.ocrChars} characters of on-screen text (OCR) sent`;
  if (e.meta.question && !qBubble.textContent) qBubble.textContent = e.meta.question;
  cancelAnimationFrame(pendingRender);
  renderAnswer();
  renderStatus();
}
function onAskError(e: AskErrorEvent): void {
  if (!accept(e.requestId)) return;
  state.ask.awaiting = false;
  if (e.error.code === 'CANCELLED') return;
  showAskError(errorText({ ok: false, error: e.error }));
}

function clearAsk(notifyMain: boolean): void {
  if (state.ask.requestId && state.ask.streaming) void g.ask.cancel(state.ask.requestId);
  Object.assign(state.ask, { requestId: null, awaiting: false, text: '', streaming: false, stage: null });
  answerEl.replaceChildren();
  input.value = '';
  setAskMode('hidden');
  renderStatus();
  if (notifyMain) void g.ask.clear();
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  submitInput('input');
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.metaKey) {
    e.preventDefault();
    submitInput('hotkey');
  } else if (e.key === 'Escape') {
    if (state.ask.mode === 'composer') setAskMode('hidden');
    input.blur();
  }
});
$('#ask-close').addEventListener('click', () => clearAsk(true));
document.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((b) =>
  b.addEventListener('click', () => void sendQuick(b.dataset.quick as QuickActionKind)),
);
$('#ask-btn').addEventListener('click', () => {
  if (state.ask.mode === 'hidden') openComposer();
  else input.focus();
});
$('#hide-btn').addEventListener('click', () => void g.overlay.hide());

// ---------- ⋮ handle: drag to move, click for menu ----------
// Manual drag (not -webkit-app-region) because drag regions swallow the mousemove events the
// preload's hover-region click-through relies on (D-S5).
function makeDraggable(el: HTMLElement, onClick?: (e: PointerEvent) => void): void {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    if (el === bar && (down.target as Element).closest('button')) return;
    let lastX = down.screenX;
    let lastY = down.screenY;
    let moved = false;
    let queued = { dx: 0, dy: 0 };
    let raf = 0;
    el.setPointerCapture(down.pointerId);
    const flush = () => {
      raf = 0;
      if (queued.dx || queued.dy) void g.overlay.move(queued);
      queued = { dx: 0, dy: 0 };
    };
    const move = (e: PointerEvent) => {
      const dx = e.screenX - lastX;
      const dy = e.screenY - lastY;
      if (!moved && Math.abs(e.screenX - down.screenX) + Math.abs(e.screenY - down.screenY) < 4) return;
      moved = true;
      bar.classList.add('dragging');
      lastX = e.screenX;
      lastY = e.screenY;
      queued = { dx: queued.dx + dx, dy: queued.dy + dy };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const up = (e: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      bar.classList.remove('dragging');
      if (raf) cancelAnimationFrame(raf);
      flush();
      if (!moved && onClick && e.type === 'pointerup') onClick(e);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
const handle = $<HTMLButtonElement>('#handle');
makeDraggable(handle, () => {
  const r = handle.getBoundingClientRect();
  void g.overlay.showMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
});
makeDraggable(bar);

// ---------- Hotkeys from main ----------
function scrollActive(dy: number): void {
  const el = state.ask.mode === 'answer' ? askScroll : insScroll;
  el.scrollBy({ top: dy, behavior: 'smooth' });
}
g.overlay.onHotkey(({ action }) => {
  if (action === 'askOrAssist') {
    if (state.ask.mode !== 'hidden' && input.value.trim()) submitInput('hotkey');
    else void sendQuick('assist', 'Assist', { source: 'hotkey' });
  } else if (action === 'clear') clearAsk(false);
  else if (action === 'scrollUp') scrollActive(-160);
  else if (action === 'scrollDown') scrollActive(160);
});

// ---------- Backend events ----------
g.ask.onStatus(onAskStatus);
g.ask.onChunk(onAskChunk);
g.ask.onDone(onAskDone);
g.ask.onError(onAskError);
g.ask.onCleared(() => clearAsk(false));
g.session.onStatus(onSessionStatus);
function onSegment(s: TranscriptSegment): void {
  if (state.session.sessionId && s.sessionId !== state.session.sessionId) return;
  state.segments.push(s);
  if (state.segments.length > 400) state.segments.splice(0, state.segments.length - 400);
  if (state.showTranscript) renderTranscript();
  else if (state.segments.length === 1) renderInsights();
}
g.session.onSegment(onSegment);
function onInsights(i: LiveInsights): void {
  if (state.session.sessionId && i.sessionId !== state.session.sessionId) return;
  state.insights = i;
  renderInsights();
}
g.session.onInsights(onInsights);

// ---------- Fit the window to the content (main keeps top edge + centre fixed) ----------
const fixture = fixtureParams();
let lastH = 0;
function fit(): void {
  if (fixture?.scene) return; // fixture scenes size the window themselves
  const hgt = Math.ceil(root.getBoundingClientRect().height);
  if (hgt === lastH) return;
  lastH = hgt;
  void g.overlay.setSize({ width: WINDOW_WIDTH, height: hgt });
}
new ResizeObserver(fit).observe(root);

// ---------- Initial state ----------
if (fixture) {
  // DEV-ONLY visual fixture (see lib/fixtures.ts). Never used as proof of a feature.
  if (fixture.scene) mountScene(fixture.scene, fixture.zoom);
  const driver: OverlayDriver = {
    sessionStatus: onSessionStatus,
    segment: onSegment,
    insights: onInsights,
    askBegin: (label, id) => {
      beginExchange(label);
      state.ask.requestId = id;
    },
    askStatus: onAskStatus,
    askChunk: onAskChunk,
    askDone: onAskDone,
    askError: onAskError,
    openComposer: () => openComposer(false),
    showTranscript: (on) => {
      state.showTranscript = on;
      renderInsights();
    },
    highlightAction: (i) => insActions.querySelectorAll('.ins-act')[i]?.classList.add('hl'),
  };
  renderSession();
  runOverlayFixture(fixture.name, driver);
  if (!fixture.name.startsWith('ask-')) sessionNote = null;
  renderStatus();
} else {
  void g.session.getStatus().then((r) => {
    if (r.ok) onSessionStatus(r.value);
  });
  renderSession();
}

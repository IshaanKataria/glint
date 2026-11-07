// Glint dashboard renderer: history list + note (Summary / Transcript / Usage) and the Settings sheet.
import {
  AppWindow, ArrowDownWideNarrow, ArrowLeft, ArrowUpRight, ArrowUpWideNarrow, AudioLines, BadgeCheck, Brain, Calendar, Clock, Copy,
  Eraser, Eye, EyeOff, Frown, Info, MousePointerClick, PanelLeft, Play, ScanText, Search, Settings, SquareArrowDown,
  SquareArrowLeft, SquareArrowRight, SquareArrowUp, SquarePen, Sparkles, X, type IconNode,
} from 'lucide';
import type {
  DashboardOpenRequest, Keybind, Result, SessionListItem, SessionRecord, SessionStatus, Settings as GlintSettings,
} from '../shared/contract';
import { $, errorText, glintMark, h, icon } from './lib/dom';
import { setMarkdown } from './lib/md';
import { clockTime, dayHeading, dayKey, fmtDuration, fmtOffset, longDate } from './lib/format';
import { fixtureHistory, fixtureParams, fixtureRecord } from './lib/fixtures';

const g = window.glint;

const ICONS: Record<string, IconNode> = {
  AppWindow, ArrowLeft, ArrowUpRight, AudioLines, BadgeCheck, Brain, Calendar, Clock, Copy, Eraser, Eye, EyeOff, Frown, Info, MousePointerClick,
  PanelLeft, Play, ScanText, Search, Settings, SquarePen, Sparkles, X,
};
function hydrateIcons(rootEl: ParentNode = document): void {
  rootEl.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const node = ICONS[el.dataset.icon!];
    if (!node || el.querySelector('svg')) return;
    const big = el.classList.contains('s-row-icon');
    const go = el.classList.contains('search-go');
    const size = big ? 20 : go ? 11 : el.classList.contains('avatar') ? 17 : el.closest('.protect-title') ? 18 : 17;
    el.append(icon(node, size, el.dataset.icon === 'Play' ? 0 : go ? 2.4 : 1.75));
  });
}
hydrateIcons();

// ---------- Data source (real IPC, or a DEV-ONLY visual fixture for scripts/ui_shots.mjs) ----------
const fx = fixtureParams();
const okv = <T>(value: T): Promise<Result<T>> => Promise.resolve({ ok: true, value });
const data = {
  list: (): Promise<Result<SessionListItem[]>> => (fx ? okv(fixtureHistory(fx.name)) : g.history.list()),
  get: (id: string): Promise<Result<SessionRecord>> => (fx ? okv(fixtureRecord(id)) : g.history.get(id)),
};

// ---------- State ----------
type Tab = 'summary' | 'transcript' | 'usage';
const state = {
  sessions: [] as SessionListItem[],
  listError: null as string | null,
  selectedId: null as string | null,
  record: null as SessionRecord | null,
  recordError: null as string | null,
  tab: 'summary' as Tab,
  query: '',
  session: { state: 'idle' } as SessionStatus,
};

const listEl = $('#history-list');
const noteEl = $('#note');
const floatEl = $('#note-float');
const searchEl = $<HTMLInputElement>('#search');
const startBtn = $<HTMLButtonElement>('#start');
const layout = $('#layout');

// ---------- Toast ----------
const toastEl = $('#toast');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
}

// ---------- History list ----------
async function loadList(selectId?: string | null): Promise<void> {
  const r = await data.list();
  if (r.ok) {
    state.sessions = [...r.value].sort((a, b) => b.startedAt - a.startedAt);
    state.listError = null;
  } else {
    state.sessions = [];
    state.listError = errorText(r);
  }
  const want = selectId ?? state.selectedId;
  const pick = state.sessions.find((s) => s.id === want) ?? state.sessions[0];
  renderList();
  if (pick && pick.id !== state.selectedId) await select(pick.id);
  else if (pick) renderList();
  else {
    state.selectedId = null;
    state.record = null;
    renderNote();
  }
}

function filtered(): SessionListItem[] {
  const q = state.query.trim().toLowerCase();
  return q ? state.sessions.filter((s) => (s.title || 'Untitled session').toLowerCase().includes(q)) : state.sessions;
}

function renderList(): void {
  layout.classList.toggle('no-sessions', state.sessions.length === 0);
  if (state.listError) {
    listEl.replaceChildren(h('div.list-empty', { text: state.listError }));
    return;
  }
  const items = filtered();
  if (!items.length) {
    listEl.replaceChildren(h('div.list-empty', { text: state.sessions.length ? 'No sessions match your search.' : 'No sessions yet.' }));
    return;
  }
  const out: HTMLElement[] = [];
  let lastDay = '';
  for (const s of items) {
    const k = dayKey(s.startedAt);
    if (k !== lastDay) {
      out.push(h('div.day-h', { text: dayHeading(s.startedAt) }));
      lastDay = k;
    }
    out.push(
      h(
        `button.row${s.id === state.selectedId ? '.sel' : ''}`,
        { type: 'button', 'data-id': s.id, onclick: () => void select(s.id) },
        h('span.row-title', { text: s.title || 'Untitled session' }),
        h('span.chip.dur', { text: fmtDuration(s.durationMs) }),
        s.uses > 0 ? h('span.chip.uses', { text: `${s.uses} ${s.uses === 1 ? 'use' : 'uses'}` }) : null,
        h('span.row-time', { text: clockTime(s.startedAt) }),
      ),
    );
  }
  listEl.replaceChildren(...out);
}

// ---------- Back navigation (previously viewed note + tab) ----------
type View = { id: string; tab: Tab };
const backStack: View[] = [];
let goingBack = false;
const backBtn = $<HTMLButtonElement>('#back');
const settingsOpen = (): boolean => !$('#settings').hidden;
function updateBack(): void {
  backBtn.disabled = !settingsOpen() && backStack.length === 0;
}
/** Remember the current view before moving away from it (not while going back). */
function remember(): void {
  if (goingBack || !state.selectedId) return;
  const top = backStack.at(-1);
  if (!top || top.id !== state.selectedId || top.tab !== state.tab) backStack.push({ id: state.selectedId, tab: state.tab });
  if (backStack.length > 50) backStack.shift();
  updateBack();
}
async function goBack(): Promise<void> {
  if (settingsOpen()) return closeSettings();
  let v = backStack.pop();
  while (v && !state.sessions.some((s) => s.id === v!.id)) v = backStack.pop(); // skip deleted sessions
  updateBack();
  if (!v) return;
  goingBack = true;
  try {
    state.tab = v.tab;
    if (v.id !== state.selectedId) await select(v.id);
    else renderNote();
  } finally {
    goingBack = false;
  }
}
backBtn.addEventListener('click', () => void goBack());

async function select(id: string): Promise<void> {
  if (id !== state.selectedId) remember();
  state.selectedId = id;
  renderList();
  const r = await data.get(id);
  if (state.selectedId !== id) return;
  state.record = r.ok ? r.value : null;
  state.recordError = r.ok ? null : errorText(r);
  renderNote();
}

searchEl.addEventListener('input', () => {
  state.query = searchEl.value;
  renderList();
});
// ↗ / Enter: open the first session that matches the search.
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.query = searchEl.value;
  renderList();
  const first = filtered()[0];
  if (first) void select(first.id);
  else if (state.query.trim()) toast('No sessions match your search.');
});
$('#search-form').addEventListener('mousedown', (e) => {
  if (!(e.target as HTMLElement).closest('button, input')) {
    e.preventDefault();
    searchEl.focus();
  }
});
$('#toggle-list').addEventListener('click', () => layout.classList.toggle('list-hidden'));

// ---------- Note ----------
function shortDate(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderEmpty(): void {
  floatEl.hidden = true;
  noteEl.replaceChildren(
    h(
      'div.empty',
      {},
      glintMark(40),
      h('h2', { text: 'No sessions yet' }),
      h('p', { text: 'Start Glint during a meeting. When you stop, your transcript, summary and action items are saved here.' }),
      h('button.start-btn', { type: 'button', onclick: () => void startOrStop() }, 'Start Glint'),
      h('div.hint', {}, 'or press ', h('kbd', { text: '⌘' }), h('kbd', { text: '⇧' }), h('kbd', { text: '\\' }), ' from anywhere'),
    ),
  );
}

function renderNote(): void {
  if (!state.sessions.length && !state.listError) return renderEmpty();
  const rec = state.record;
  if (!rec) {
    floatEl.hidden = true;
    noteEl.replaceChildren(state.recordError ? h('div.err', { text: state.recordError }) : h('div'));
    return;
  }
  const item = state.sessions.find((s) => s.id === rec.id);
  const uses = item?.uses ?? rec.usage.length;
  const tabs: Array<[Tab, string]> = [['summary', 'Summary'], ['transcript', 'Transcript'], ['usage', 'Usage']];
  const copy =
    state.tab === 'summary'
      ? h('button.ghost-btn', { type: 'button', onclick: () => void copySummary(rec) }, icon(Copy, 13), 'Copy full summary')
      : state.tab === 'transcript'
        ? h('button.ghost-btn', { type: 'button', onclick: () => void copyTranscript(rec) }, icon(Copy, 13), 'Copy full transcript')
        : null;

  noteEl.replaceChildren(
    h('h1.note-title', { text: rec.title || 'Untitled session' }),
    h(
      'div.meta-row',
      {},
      h('span.meta-chip', { title: longDate(rec.startedAt) }, icon(Calendar, 13), `${shortDate(rec.startedAt)} · ${clockTime(rec.startedAt)}`),
      h('span.meta-chip', {}, icon(Clock, 13), fmtDuration(rec.durationMs)),
      uses ? h('span.meta-chip', {}, icon(Sparkles, 13), `${uses} ${uses === 1 ? 'use' : 'uses'}`) : null,
    ),
    h(
      'div.tabs-row',
      {},
      h(
        'div.seg',
        { role: 'tablist' },
        ...tabs.map(([k, label]) =>
          h(`button${state.tab === k ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': state.tab === k, onclick: () => setTab(k) }, label),
        ),
      ),
      copy,
    ),
    state.tab === 'summary' ? summaryTab(rec) : state.tab === 'transcript' ? transcriptTab(rec) : usageTab(rec),
  );
  floatEl.hidden = false;
  $('#view-transcript').hidden = state.tab === 'transcript';
}

function setTab(t: Tab): void {
  if (t !== state.tab) remember();
  state.tab = t;
  renderNote();
  $('#note-scroll').scrollTop = 0;
}

function summaryTab(rec: SessionRecord): HTMLElement {
  const wrap = h('div');
  wrap.append(h('h2.sec-h', { text: 'Action Items' }));
  if (rec.actionItems.length) wrap.append(h('ul.bullets', {}, ...rec.actionItems.map((a) => h('li', { text: a }))));
  else wrap.append(h('p.muted-p', { text: 'No action items were found in this session.' }));
  const md = h('div.md');
  if (rec.summaryMarkdown?.trim()) {
    setMarkdown(md, rec.summaryMarkdown);
    // A paragraph that is only bold text is a topic heading ("**Pricing**"), styled like the reference's "Meeting Context".
    md.querySelectorAll('p').forEach((p) => {
      const only = p.children.length === 1 && p.firstElementChild?.tagName === 'STRONG';
      if (only && p.textContent?.trim() === p.firstElementChild?.textContent?.trim()) p.classList.add('h');
    });
    // Plain-prose summaries get one heading so the note reads as sections, like the reference.
    const first = md.firstElementChild;
    if (first && !/^H[1-4]$/.test(first.tagName) && !first.classList.contains('h')) md.prepend(h('h3', { text: 'Overview' }));
  }
  else md.append(h('p.muted-p', { text: rec.endedAt ? 'No summary was written for this session.' : 'The summary appears here when the session ends.' }));
  wrap.append(md);
  return wrap;
}

function transcriptTab(rec: SessionRecord): HTMLElement {
  if (!rec.segments.length) return h('p.muted-p', { text: 'No transcript for this session.' });
  return h(
    'div',
    {},
    ...rec.segments.map((s) =>
      h(
        'div.tr-line',
        {},
        h(`span.tr-who.${s.speaker}`, { text: s.speaker === 'me' ? 'Me' : 'Them' }),
        h('span.tr-t', { text: fmtOffset(s.tStart) }),
        h('div.tr-text', { text: s.text }),
      ),
    ),
  );
}

const KIND_LABEL: Record<string, string> = { ask: 'Ask', assist: 'Assist', whatShouldISay: 'What should I say?', followUps: 'Follow-up questions', recap: 'Recap' };
function usageTab(rec: SessionRecord): HTMLElement {
  if (!rec.usage.length) return h('p.muted-p', { text: 'Glint was not asked anything during this session.' });
  return h(
    'div',
    {},
    ...rec.usage.map((u) =>
      h(
        'div.use',
        {},
        h(
          'div.use-q',
          {},
          u.kind === 'ask' ? u.question : KIND_LABEL[u.kind] ?? u.kind,
          u.kind !== 'ask' ? h('span.tag.blue', { text: 'Quick action' }) : null,
          u.usedScreenshot ? h('span.tag', {}, icon(ScanText, 12), 'Screen') : null,
        ),
        h('div.use-a', { text: u.answer }),
        h('div.use-meta', { text: `${clockTime(u.at)} · ${u.model}${u.usedScreenshot ? ` · ${u.ocrChars} chars of screen text` : ''}` }),
      ),
    ),
  );
}

// ---------- Copy / resume / start ----------
async function copySummary(rec: SessionRecord): Promise<void> {
  let r: Result<{ chars: number }> = await g.history.copySummary(rec.id);
  if (!r.ok && r.error.code === 'NOT_IMPLEMENTED') {
    const text = [`# ${rec.title}`, '', '## Action Items', ...rec.actionItems.map((a) => `- ${a}`), '', rec.summaryMarkdown ?? ''].join('\n');
    r = await g.app.copyText(text);
  }
  toast(r.ok ? `Summary copied (${r.value.chars.toLocaleString()} characters)` : errorText(r));
}

async function copyTranscript(rec: SessionRecord): Promise<void> {
  let r: Result<{ chars: number }> = await g.history.copyTranscript(rec.id);
  if (!r.ok && r.error.code === 'NOT_IMPLEMENTED') {
    const text = rec.segments.map((s) => `${s.speaker === 'me' ? 'Me' : 'Them'} ${fmtOffset(s.tStart)}\n${s.text}`).join('\n\n');
    r = await g.app.copyText(text);
  }
  toast(r.ok ? `Transcript copied (${r.value.chars.toLocaleString()} characters)` : errorText(r));
}

$('#resume').addEventListener('click', async () => {
  if (!state.record) return;
  const r = await g.history.resume(state.record.id);
  if (!r.ok) return toast(`Couldn't resume: ${errorText(r)}`);
  onSession(r.value);
  void g.overlay.show();
  toast('Session resumed in the overlay');
});
$('#view-transcript').addEventListener('click', () => setTab('transcript'));

const isLive = (s: SessionStatus) => ['starting', 'recording', 'stopping', 'summarizing'].includes(s.state);
function onSession(s: SessionStatus): void {
  state.session = s;
  const live = isLive(s);
  startBtn.textContent = live ? (s.state === 'recording' || s.state === 'starting' ? 'Stop Glint' : 'Saving…') : 'Start Glint';
  startBtn.classList.toggle('live', live);
}
async function startOrStop(): Promise<void> {
  const live = isLive(state.session);
  const r = live ? await g.session.stop() : await g.session.start();
  if (!r.ok) return toast(`${live ? "Couldn't stop" : "Couldn't start"}: ${errorText(r)}`);
  onSession(r.value);
  if (!live) void g.overlay.show();
}
startBtn.addEventListener('click', () => void startOrStop());
g.session.onStatus(onSession);
g.history.onChanged(({ sessionId }) => {
  if (fx) return;
  void loadList(state.selectedId ?? sessionId).then(() => {
    if (state.selectedId === sessionId) void select(sessionId);
  });
});

// ---------- Settings sheet ----------
type Pane = 'general' | 'keybinds' | 'about';
const sheet = $('#settings');
let settings: GlintSettings | null = null;

function openSettings(pane: Pane = 'general'): void {
  sheet.hidden = false;
  showPane(pane);
  void loadSettings();
  updateBack();
}
function closeSettings(): void {
  sheet.hidden = true;
  updateBack();
}
function showPane(p: Pane): void {
  document.querySelectorAll<HTMLElement>('.s-nav[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === p));
  for (const name of ['general', 'keybinds', 'about'] as const) $(`#pane-${name}`).hidden = p !== name;
  if (p === 'keybinds') void loadKeybinds();
}
document.querySelectorAll<HTMLElement>('.s-nav[data-pane]').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane as Pane)));
$('#open-settings').addEventListener('click', () => openSettings());
$('#s-close').addEventListener('click', closeSettings);
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSettings();
});
$('#s-quit').addEventListener('click', () => void g.app.quit());

const protectEl = $<HTMLInputElement>('#set-protect');
const clickEl = $<HTMLInputElement>('#set-click');
const shotEl = $<HTMLInputElement>('#set-shot');

function renderProtect(on: boolean): void {
  protectEl.checked = on;
  $('#protect-heading').textContent = 'Hide from screen share';
  $('#protect-sub').textContent = on
    ? "On: Glint windows don't appear in screen shares, recordings or screenshots."
    : 'Off: people you share your screen with can see Glint.';
  const slot = $('#protect-icon');
  slot.replaceChildren(icon(on ? EyeOff : Eye, 18));
}

async function loadSettings(): Promise<void> {
  const [s, ov, info] = await Promise.all([g.settings.get(), g.overlay.getState(), g.app.info()]);
  if (s.ok) {
    settings = s.value;
    renderProtect(s.value.hideFromScreenShare);
    shotEl.checked = s.value.attachScreenshotByDefault;
  }
  if (ov.ok) clickEl.checked = ov.value.clickThrough;
  if (info.ok) {
    $('#version-sub').textContent = `You are using Glint version ${info.value.version}`;
    $('#about').textContent = `About v${info.value.version}`;
    $('#about-version').textContent = info.value.version;
    $('#about-platform').textContent = info.value.platform;
    $('#about-data').textContent = info.value.dataDir;
  }
}

protectEl.addEventListener('change', async () => {
  const r = await g.settings.set({ hideFromScreenShare: protectEl.checked });
  if (r.ok) renderProtect(r.value.hideFromScreenShare);
  else {
    toast(errorText(r));
    renderProtect(!protectEl.checked);
  }
});
shotEl.addEventListener('change', async () => {
  const r = await g.settings.set({ attachScreenshotByDefault: shotEl.checked });
  if (!r.ok) {
    toast(errorText(r));
    shotEl.checked = !shotEl.checked;
  }
});
clickEl.addEventListener('change', async () => {
  const r = await g.overlay.setClickThrough(clickEl.checked);
  if (r.ok) clickEl.checked = r.value.clickThrough;
  else toast(errorText(r));
});
g.settings.onChanged((s) => {
  settings = s;
  renderProtect(s.hideFromScreenShare);
  shotEl.checked = s.attachScreenshotByDefault;
});
g.overlay.onState((s) => (clickEl.checked = s.clickThrough));

// Keybinds: main sends one row per hotkey; "a / b / c" labels with "x/y/z" keys expand into one row each,
// like the reference list ("Move the window position up", "... down", ...).
const KB_ICON: Record<string, IconNode> = {
  toggleOverlay: AppWindow, askOrAssist: Brain, clear: Eraser, toggleSession: AudioLines, toggleClickThrough: MousePointerClick,
};
const DIR_ICON: Record<string, IconNode> = {
  up: SquareArrowUp, down: SquareArrowDown, left: SquareArrowLeft, right: SquareArrowRight,
};
interface KbRow { label: string; keys: string[]; icon: IconNode; registered: boolean }

function expand(k: Keybind): KbRow[] {
  const multi = k.keys.findIndex((x) => x.includes('/') && x.length > 1);
  const m = /^(.*?)((?:\w+ \/ )+\w+)(.*)$/.exec(k.label);
  if (multi >= 0 && m) {
    const words = m[2].split(' / ');
    const alts = k.keys[multi].split('/');
    if (words.length === alts.length) {
      return words.map((w, i) => ({
        label: `${m[1]}${w}${m[3]}`.replace(/\s+/g, ' ').trim(),
        keys: k.keys.map((x, j) => (j === multi ? alts[i] : x)),
        icon: k.id === 'scrollAnswer' ? (w === 'up' ? ArrowUpWideNarrow : ArrowDownWideNarrow) : DIR_ICON[w] ?? AppWindow,
        registered: k.registered,
      }));
    }
  }
  return [{ label: k.label, keys: k.keys, icon: KB_ICON[k.id] ?? AppWindow, registered: k.registered }];
}

async function loadKeybinds(): Promise<void> {
  const box = $('#keybinds');
  const r = await g.settings.keybinds();
  if (!r.ok) {
    box.replaceChildren(h('div.err', { text: errorText(r) }));
    return;
  }
  const groups: Keybind['group'][] = ['General', 'Window', 'Scroll'];
  const out: HTMLElement[] = [];
  for (const grp of groups) {
    const rows = r.value.filter((k) => k.group === grp).flatMap(expand);
    if (!rows.length) continue;
    out.push(h('div.kb-group', { text: grp }));
    for (const row of rows) {
      out.push(
        h(
          'div.kb-row',
          {},
          icon(row.icon, 15),
          h('span.kb-label', {}, row.label),
          h('span.kb-keys', {}, ...row.keys.map((k) => h('kbd', { text: k }))),
        ),
      );
    }
  }
  box.replaceChildren(...out);
}

// ---------- Keyboard ----------
window.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  } else if (e.metaKey && e.key === '[') {
    e.preventDefault();
    void goBack();
  } else if (e.metaKey && e.key === ',') {
    e.preventDefault();
    openSettings();
  } else if (e.key === 'Escape' && !sheet.hidden) closeSettings();
});

// ---------- Navigation ----------
function navigate(req: DashboardOpenRequest): void {
  if (req.view === 'settings') openSettings();
  else {
    closeSettings();
    if (req.sessionId) void loadList(req.sessionId);
  }
}
g.app.onDashboardNavigate(navigate);

// ---------- Boot ----------
const q = new URLSearchParams(location.search);
void g.session.getStatus().then((r) => r.ok && onSession(r.value));
if (fx) {
  // DEV-ONLY visual fixture (lib/fixtures.ts). Never proof of a feature.
  if (fx.name === 'transcript') state.tab = 'transcript';
  if (fx.name === 'usage') state.tab = 'usage';
  void loadList().then(() => {
    if (fx.name === 'settings-general') openSettings('general');
    if (fx.name === 'settings-keybinds') openSettings('keybinds');
  });
} else {
  void loadList(q.get('sessionId'));
  if (q.get('view') === 'settings') openSettings();
}

/**
 * Glint IPC contract: the single source of truth for every channel between the main
 * process and the renderers, plus the `window.glint` API the preload exposes.
 *
 * Owner: Shell + overlay agent. Audio and AI agents may only edit the two RESERVED
 * sections at the bottom (and must keep their channel names prefixed `audio:` / `ai:`).
 * Anything else: request the change in your note.
 *
 * Conventions
 * - Invoke channels (renderer -> main, request/response) always resolve to `Result<T>`;
 *   handlers never reject across IPC. Use `ctx.handle()` in main, which wraps throws.
 * - Event channels (main -> renderer) are fire-and-forget payloads, sent with `ctx.emit()`.
 * - Times are epoch milliseconds unless the field name says otherwise (tStart/tEnd are
 *   seconds from session start).
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'BUSY'
  | 'NO_API_KEY'
  | 'PERMISSION_DENIED'
  | 'UPSTREAM'
  | 'CANCELLED'
  | 'TEST_ONLY'
  | 'INTERNAL';

export interface GlintErrorInfo {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: GlintErrorInfo };

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

export type WindowKind = 'overlay' | 'dashboard';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Broadcast on every change of overlay visibility, position, click-through or protection. */
export interface OverlayState {
  visible: boolean;
  bounds: Bounds;
  /** User-toggled click-through mode: the whole overlay ignores the mouse. */
  clickThrough: boolean;
  /** Effective setIgnoreMouseEvents state right now (click-through mode OR pointer over a transparent area). */
  ignoreMouseEvents: boolean;
  /** "Hide from screen share" (setContentProtection) on the overlay window. */
  contentProtection: boolean;
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/** Actions the main process forwards to the overlay renderer when a global hotkey fires. */
export type HotkeyAction =
  | 'toggleOverlay'
  | 'askOrAssist' // ⌘↵: renderer sends its input text as ask(), or assist if empty
  | 'clear' // ⌘R: clear the conversation and collapse the answer
  | 'toggleSession' // ⌘⇧\ : main already started/stopped the session; renderer just reflects it
  | 'move' // ⌘ + arrows: main already moved the window
  | 'scrollUp' // ⌘⇧↑
  | 'scrollDown' // ⌘⇧↓
  | 'toggleClickThrough'; // ⌘⌥\

export interface HotkeyEvent {
  action: HotkeyAction;
  direction?: MoveDirection;
}

export type KeybindGroup = 'General' | 'Window' | 'Scroll';

export interface Keybind {
  id: HotkeyId;
  label: string;
  group: KeybindGroup;
  /** Electron accelerator string(s) actually registered. */
  accelerators: string[];
  /** Keycaps for display, e.g. ['⌘', '\\'] or ['⌘', '↑/↓/←/→']. */
  keys: string[];
  /** 'always' = registered at launch; 'whileVisible' = only while the overlay is shown. */
  scope: 'always' | 'whileVisible';
  /** Live globalShortcut.isRegistered() result for every accelerator. */
  registered: boolean;
}

export type HotkeyId =
  | 'toggleOverlay'
  | 'askOrAssist'
  | 'clear'
  | 'toggleSession'
  | 'moveWindow'
  | 'scrollAnswer'
  | 'toggleClickThrough';

// ----- Ask -----

export type QuickActionKind = 'assist' | 'whatShouldISay' | 'followUps' | 'recap';

export interface AskOptions {
  /** Capture the screen and OCR it into the prompt. Defaults to settings.attachScreenshotByDefault. */
  withScreenshot?: boolean;
  /** Include the live/resumed session transcript if one exists. Default true. */
  includeTranscript?: boolean;
  /** Where the ask came from, for the Usage tab. */
  source?: 'input' | 'hotkey' | 'chip' | 'insight';
  /** When source is 'insight', the InsightAction.id that was clicked. */
  insightId?: string;
}

export interface AskStarted {
  requestId: string;
}

export type AskStage = 'capturing' | 'ocr' | 'thinking' | 'streaming';

/** Status line under the bar: "Analyzing screen..." (capturing/ocr), "Thinking..." (thinking). */
export interface AskStatusEvent {
  requestId: string;
  stage: AskStage;
}

export interface AskChunkEvent {
  requestId: string;
  /** Markdown text to append. */
  delta: string;
}

export interface AnswerMeta {
  requestId: string;
  kind: 'ask' | QuickActionKind;
  /** The question as shown in the pill (for quick actions, its label, e.g. "Assist"). */
  question: string;
  usedScreenshot: boolean;
  /** Characters of OCR text sent to the model (0 when no screenshot). */
  ocrChars: number;
  /** DeepSeek model id that answered, e.g. 'deepseek-v4-pro'. */
  model: string;
  sessionId?: string;
  startedAt: number;
  finishedAt: number;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AskDoneEvent {
  requestId: string;
  /** The full markdown answer. */
  answer: string;
  meta: AnswerMeta;
}

export interface AskErrorEvent {
  requestId: string;
  error: GlintErrorInfo;
}

// ----- Session (live meeting) -----

export type Speaker = 'me' | 'them';

export interface TranscriptSegment {
  sessionId: string;
  id: string;
  speaker: Speaker;
  text: string;
  /** Seconds from session start. */
  tStart: number;
  tEnd: number;
}

export interface SessionStartRequest {
  /** Use this audio file as the source instead of the mic (also set by GLINT_AUDIO_FILE). */
  audioFile?: string;
  /** Continue an existing session (appends to its transcript). */
  resumeSessionId?: string;
}

export type SessionState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'summarizing'
  | 'saved'
  | 'error';

export interface SessionStatus {
  state: SessionState;
  sessionId?: string;
  startedAt?: number;
  /** 'mic', 'mic+system' or 'file'. */
  source?: 'mic' | 'mic+system' | 'file';
  /** Human-readable detail, e.g. "Connecting audio..." or an error message. */
  message?: string;
}

export type InsightActionKind = 'question' | 'define' | 'followUp' | 'actionItem';

export interface InsightAction {
  id: string;
  kind: InsightActionKind;
  /** Display text; clicking it asks Glint with this text. */
  text: string;
}

export interface LiveInsights {
  sessionId: string;
  /** Rolling summary, markdown with bold section headings and bullets. */
  summaryMarkdown: string;
  /** "Actions" list under the summary (detected questions, terms to define, follow-ups, to-dos). */
  actionItems: InsightAction[];
  updatedAt: number;
  model?: string;
}

// ----- History (saved sessions) -----

export interface SessionListItem {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  /** Number of AI asks during the session ("4 uses"). */
  uses: number;
  hasSummary: boolean;
}

export interface UsageEntry {
  requestId: string;
  kind: 'ask' | QuickActionKind;
  question: string;
  answer: string;
  usedScreenshot: boolean;
  ocrChars: number;
  model: string;
  at: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  source?: SessionStatus['source'];
  segments: TranscriptSegment[];
  summaryMarkdown?: string;
  actionItems: string[];
  usage: UsageEntry[];
  /** Absolute path of notes.md, if written. */
  notesPath?: string;
}

export interface CopyResult {
  chars: number;
}

// ----- Settings -----

export interface Settings {
  /** setContentProtection on every Glint window. Default true. */
  hideFromScreenShare: boolean;
  /** Attach a screenshot (OCR) to typed asks by default. Default true (FEATURES F14). */
  attachScreenshotByDefault: boolean;
  /** Model for asks and summaries. */
  answerModel: string;
  /** Model for streaming live insights. */
  liveModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  hideFromScreenShare: true,
  attachScreenshotByDefault: true,
  answerModel: 'deepseek-v4-pro',
  liveModel: 'deepseek-flash',
};

// ----- Dashboard / app -----

export type DashboardView = 'history' | 'settings';

export interface DashboardOpenRequest {
  view?: DashboardView;
  sessionId?: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  testMode: boolean;
  dataDir: string;
  windowKind: WindowKind;
}

// ----- Test introspection (GLINT_TEST=1 only) -----

export interface WindowState {
  visible: boolean;
  bounds: Bounds;
  alwaysOnTop: boolean;
  /** Level passed to setAlwaysOnTop (Electron has no getter, so main tracks it). */
  alwaysOnTopLevel: string | null;
  contentProtection: boolean;
  ignoreMouseEvents: boolean;
  focused: boolean;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Invoke channels. `req` is the single payload argument (void = none). */
export interface CoreInvokeMap {
  // Overlay (Shell)
  'overlay:toggle': { req: void; res: OverlayState };
  'overlay:show': { req: void; res: OverlayState };
  'overlay:hide': { req: void; res: OverlayState };
  'overlay:getState': { req: void; res: OverlayState };
  'overlay:move': { req: MoveDirection | { dx: number; dy: number }; res: OverlayState };
  /** Resize to fit content; keeps the top edge and horizontal centre fixed. */
  'overlay:setSize': { req: { width: number; height: number }; res: OverlayState };
  /** User click-through mode on/off. */
  'overlay:setClickThrough': { req: boolean; res: OverlayState };
  /** Hover regions: renderer reports whether the pointer is over an interactive element. Ignored while click-through mode is on. */
  'overlay:setInteractive': { req: boolean; res: OverlayState };
  /** Toggles the "Hide from screen share" setting for ALL windows (same as settings.set). */
  'overlay:setContentProtection': { req: boolean; res: OverlayState };
  /** Give the overlay keyboard focus (for typing). */
  'overlay:focus': { req: void; res: OverlayState };
  /** Pop up the native ⋮ menu (Open Glint, Settings, Hide from screen share, Click-through, Hide, Quit). */
  'overlay:showMenu': { req: { x: number; y: number } | void; res: void };

  // Ask (AI)
  'ask:ask': { req: { question: string; options?: AskOptions }; res: AskStarted };
  'ask:quick': { req: { kind: QuickActionKind; options?: AskOptions }; res: AskStarted };
  'ask:cancel': { req: { requestId: string }; res: void };
  /** ⌘R: forget the current conversation thread. */
  'ask:clear': { req: void; res: void };

  // Session (Audio for capture/transcription; AI for insights and saving)
  'session:start': { req: SessionStartRequest | void; res: SessionStatus };
  'session:stop': { req: void; res: SessionStatus };
  'session:getStatus': { req: void; res: SessionStatus };

  // History (AI, src/sessions)
  'history:list': { req: void; res: SessionListItem[] };
  'history:get': { req: { id: string }; res: SessionRecord };
  'history:resume': { req: { id: string }; res: SessionStatus };
  'history:copyTranscript': { req: { id: string }; res: CopyResult };
  'history:copySummary': { req: { id: string }; res: CopyResult };

  // Settings (Shell)
  'settings:get': { req: void; res: Settings };
  'settings:set': { req: Partial<Settings>; res: Settings };
  'settings:keybinds': { req: void; res: Keybind[] };

  // App (Shell)
  'app:info': { req: void; res: AppInfo };
  'app:copyText': { req: { text: string }; res: CopyResult };
  'dashboard:open': { req: DashboardOpenRequest | void; res: void };
  'app:quit': { req: void; res: void };

  // Test introspection (Shell), returns TEST_ONLY unless GLINT_TEST=1
  'test:getWindowState': { req: { window?: WindowKind } | void; res: WindowState };
  /** Runs the same handler a global hotkey runs (does not prove the OS delivered the key). */
  'test:triggerHotkey': { req: { id: HotkeyId; direction?: MoveDirection }; res: void };
}

/** Event channels (main -> renderer). */
export interface CoreEventMap {
  'overlay:state': OverlayState;
  'hotkey': HotkeyEvent;
  /** Sent to every window; the preload also toggles `html.glint-protected` (FEATURES F42). */
  'window:protection': { enabled: boolean };

  'ask:status': AskStatusEvent;
  'ask:chunk': AskChunkEvent;
  'ask:done': AskDoneEvent;
  'ask:error': AskErrorEvent;
  /** Main asked the renderer to clear (e.g. after ⌘R handled in main). */
  'ask:cleared': Record<string, never>;

  'session:status': SessionStatus;
  'session:segment': TranscriptSegment;
  'session:insights': LiveInsights;

  /** A session was saved or changed on disk; dashboards should refresh the list. */
  'history:changed': { sessionId: string };

  'settings:changed': Settings;
  'dashboard:navigate': DashboardOpenRequest;
}

// ---------------------------------------------------------------------------
// In-process main bus (service <-> service, never crosses IPC)
// ---------------------------------------------------------------------------

export interface CoreBusMap {
  /** Audio emits when capture starts (new or resumed session). */
  'session:started': { sessionId: string; startedAt: number; resumed: boolean; source: SessionStatus['source'] };
  /** Audio emits every finished transcript segment (also sent to renderers as session:segment). */
  'transcript:segment': TranscriptSegment;
  /** Audio emits after capture and the last chunk's transcription finished. */
  'session:stopped': { sessionId: string; endedAt: number };
  /** AI emits after every finished ask, for the Usage tab and "uses" count. */
  'ai:exchange': UsageEntry & { sessionId?: string };
  'settings:changed': Settings;
}

// ===========================================================================
// RESERVED: Audio + transcription agent. Add channels here only, names prefixed
// `audio:`. Renderers reach them through `window.glint.ext.invoke/on`.
// ===========================================================================
export interface AudioChunkStat {
  speaker: Speaker;
  /** Seconds from session start (includes the resume offset). */
  tStart: number;
  durationSec: number;
  /** True when the chunk was not sent to WhisperX (silence, or a mic chunk that was system-audio echo). */
  skipped: boolean;
  skipReason?: 'silence' | 'echo';
  /** Levels in dBFS (no audio content): peak sample, whole-chunk RMS, loudest 20 ms frame, stream noise floor, voiced threshold. */
  peakDb: number;
  rmsDb: number;
  maxFrameDb: number;
  noiseFloorDb: number;
  voicedThresholdDb: number;
  /** Seconds of 20 ms frames above the voiced threshold. */
  voicedSec: number;
  /** Mic chunks with a speaker echo reference: voiced seconds attributed to the user vs explained by speaker playback, speaker voiced seconds, echo level (mic dB - speaker dB). */
  echoUserSec?: number;
  echoExplainedSec?: number;
  refVoicedSec?: number;
  couplingDb?: number;
  /** Time WhisperX spent on the chunk. */
  workerMs?: number;
  /** From the chunk being cut (its last sample captured/decoded) to its segment being emitted. */
  latencyMs?: number;
  chars?: number;
  error?: string;
}

export interface AudioStats {
  sessionId?: string;
  worker: {
    state: 'stopped' | 'loading' | 'ready' | 'failed';
    pid?: number;
    model: string;
    loadMs?: number;
    restarts: number;
    lastError?: string;
  };
  /** 'echoRef' is the built-in-speaker tap used only as an echo reference (never transcribed). */
  sources: { kind: 'file' | 'mic' | 'system' | 'echoRef'; speaker: Speaker; bytes: number; running: boolean }[];
  /** Echo reference state, e.g. 'on: built-in speakers' or 'off: ...'. */
  echoReference?: string;
  /** Why system audio is off, if it is (permission, unsupported, disabled). */
  systemAudio?: string;
  chunks: AudioChunkStat[];
  config: {
    minChunkSec: number;
    maxChunkSec: number;
    fileSpeaker: Speaker;
    filePace: 'fast' | 'realtime';
    fileAutoStop: boolean;
    echoFilter: boolean;
  };
}

/** The file source (GLINT_AUDIO_FILE / audioFile) was fully transcribed. The session stays open unless GLINT_AUDIO_FILE_AUTOSTOP=1. */
export interface AudioFileDone {
  sessionId: string;
  audioSec: number;
  segments: number;
  autoStop: boolean;
}

export interface AudioInvokeMap {
  /** Worker, source and per-chunk timing stats for the current (or last) session. */
  'audio:getStats': { req: void; res: AudioStats };
}
export interface AudioEventMap {
  'audio:fileDone': AudioFileDone;
}
export interface AudioBusMap {
  'audio:fileDone': AudioFileDone;
}
// ===================== END RESERVED: Audio ================================

// ===========================================================================
// RESERVED: AI agent. Add channels here only, names prefixed `ai:`.
// ===========================================================================
export interface AiInvokeMap {
  // 'ai:testConnection': { req: void; res: { model: string; ms: number } };
}
export interface AiEventMap {}
export interface AiBusMap {}
// ===================== END RESERVED: AI ===================================

export interface InvokeMap extends CoreInvokeMap, AudioInvokeMap, AiInvokeMap {}
export interface EventMap extends CoreEventMap, AudioEventMap, AiEventMap {}
export interface BusMap extends CoreBusMap, AudioBusMap, AiBusMap {}

export type InvokeChannel = keyof InvokeMap;
export type EventChannel = keyof EventMap;
export type BusEvent = keyof BusMap;
export type Req<C extends InvokeChannel> = InvokeMap[C]['req'];
export type Res<C extends InvokeChannel> = InvokeMap[C]['res'];

export type ExtInvokeChannel = keyof AudioInvokeMap | keyof AiInvokeMap;
export type ExtEventChannel = keyof AudioEventMap | keyof AiEventMap;
/** Runtime guard the preload applies to `glint.ext` channels. */
export const EXT_CHANNEL_PREFIXES = ['audio:', 'ai:'] as const;

/** Every core invoke channel. Main registers a NOT_IMPLEMENTED fallback for any channel no module handled. */
export const CORE_INVOKE_CHANNELS = [
  'overlay:toggle', 'overlay:show', 'overlay:hide', 'overlay:getState', 'overlay:move', 'overlay:setSize',
  'overlay:setClickThrough', 'overlay:setInteractive', 'overlay:setContentProtection', 'overlay:focus', 'overlay:showMenu',
  'ask:ask', 'ask:quick', 'ask:cancel', 'ask:clear',
  'session:start', 'session:stop', 'session:getStatus',
  'history:list', 'history:get', 'history:resume', 'history:copyTranscript', 'history:copySummary',
  'settings:get', 'settings:set', 'settings:keybinds',
  'app:info', 'app:copyText', 'dashboard:open', 'app:quit',
  'test:getWindowState', 'test:triggerHotkey',
] as const satisfies readonly (keyof CoreInvokeMap)[];

/** Which module registers which invoke channels (documentation + startup check). */
export const CHANNEL_OWNERS = {
  shell: ['overlay:', 'settings:', 'app:', 'dashboard:', 'test:'],
  ai: ['ask:', 'ai:'],
  audio: ['session:', 'audio:'],
  sessions: ['history:'],
} as const;

/** Every core event channel; the preload only lets renderers subscribe to these (plus ext). */
export const CORE_EVENT_CHANNELS = [
  'overlay:state',
  'hotkey',
  'window:protection',
  'ask:status',
  'ask:chunk',
  'ask:done',
  'ask:error',
  'ask:cleared',
  'session:status',
  'session:segment',
  'session:insights',
  'history:changed',
  'settings:changed',
  'dashboard:navigate',
] as const satisfies readonly (keyof CoreEventMap)[];

// ---------------------------------------------------------------------------
// window.glint (preload API)
// ---------------------------------------------------------------------------

export type Unsubscribe = () => void;
type P<C extends InvokeChannel> = Promise<Result<Res<C>>>;
type On<E extends EventChannel> = (cb: (payload: EventMap[E]) => void) => Unsubscribe;

export interface GlintApi {
  /** Which window this preload runs in. */
  windowKind: WindowKind;
  /** True when GLINT_TEST=1. */
  testMode: boolean;

  overlay: {
    toggle(): P<'overlay:toggle'>;
    show(): P<'overlay:show'>;
    hide(): P<'overlay:hide'>;
    getState(): P<'overlay:getState'>;
    move(dir: Req<'overlay:move'>): P<'overlay:move'>;
    setSize(size: Req<'overlay:setSize'>): P<'overlay:setSize'>;
    setClickThrough(on: boolean): P<'overlay:setClickThrough'>;
    setInteractive(on: boolean): P<'overlay:setInteractive'>;
    setContentProtection(on: boolean): P<'overlay:setContentProtection'>;
    focus(): P<'overlay:focus'>;
    showMenu(at?: { x: number; y: number }): P<'overlay:showMenu'>;
    onState: On<'overlay:state'>;
    onHotkey: On<'hotkey'>;
  };

  ask: {
    ask(question: string, options?: AskOptions): P<'ask:ask'>;
    quick(kind: QuickActionKind, options?: AskOptions): P<'ask:quick'>;
    assist(options?: AskOptions): P<'ask:quick'>;
    whatShouldISay(options?: AskOptions): P<'ask:quick'>;
    followUps(options?: AskOptions): P<'ask:quick'>;
    recap(options?: AskOptions): P<'ask:quick'>;
    cancel(requestId: string): P<'ask:cancel'>;
    clear(): P<'ask:clear'>;
    onStatus: On<'ask:status'>;
    onChunk: On<'ask:chunk'>;
    onDone: On<'ask:done'>;
    onError: On<'ask:error'>;
    onCleared: On<'ask:cleared'>;
  };

  session: {
    start(req?: SessionStartRequest): P<'session:start'>;
    stop(): P<'session:stop'>;
    getStatus(): P<'session:getStatus'>;
    onStatus: On<'session:status'>;
    onSegment: On<'session:segment'>;
    onInsights: On<'session:insights'>;
  };

  history: {
    list(): P<'history:list'>;
    get(id: string): P<'history:get'>;
    resume(id: string): P<'history:resume'>;
    copyTranscript(id: string): P<'history:copyTranscript'>;
    copySummary(id: string): P<'history:copySummary'>;
    onChanged: On<'history:changed'>;
  };

  settings: {
    get(): P<'settings:get'>;
    set(patch: Partial<Settings>): P<'settings:set'>;
    keybinds(): P<'settings:keybinds'>;
    onChanged: On<'settings:changed'>;
  };

  app: {
    info(): P<'app:info'>;
    copyText(text: string): P<'app:copyText'>;
    openDashboard(req?: DashboardOpenRequest): P<'dashboard:open'>;
    quit(): P<'app:quit'>;
    onDashboardNavigate: On<'dashboard:navigate'>;
    onProtection: On<'window:protection'>;
  };

  /** Extension channels from the RESERVED sections (prefix-checked at runtime). */
  ext: {
    invoke<C extends ExtInvokeChannel>(channel: C, req?: Req<C>): P<C>;
    on<E extends ExtEventChannel>(channel: E, cb: (payload: EventMap[E]) => void): Unsubscribe;
  };

  /** GLINT_TEST=1 only; otherwise every call resolves to { ok:false, error:{ code:'TEST_ONLY' } }. */
  test: {
    getWindowState(window?: WindowKind): P<'test:getWindowState'>;
    triggerHotkey(id: HotkeyId, direction?: MoveDirection): P<'test:triggerHotkey'>;
  };
}

declare global {
  interface Window {
    glint: GlintApi;
  }
}

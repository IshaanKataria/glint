import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  CORE_EVENT_CHANNELS,
  EXT_CHANNEL_PREFIXES,
  type EventChannel,
  type EventMap,
  type GlintApi,
  type InvokeChannel,
  type OverlayState,
  type Result,
  type WindowKind,
} from '../shared/contract';

const windowKind: WindowKind = process.argv.includes('--glint-window=dashboard') ? 'dashboard' : 'overlay';
const testMode = process.argv.includes('--glint-test');
const vibrancy = windowKind === 'dashboard' && process.argv.includes('--glint-vibrancy');

const invoke = <T>(channel: InvokeChannel, req?: unknown): Promise<Result<T>> =>
  ipcRenderer.invoke(channel, req) as Promise<Result<T>>;

const allowedEvents = new Set<string>(CORE_EVENT_CHANNELS);
const isExt = (c: string) => EXT_CHANNEL_PREFIXES.some((p) => c.startsWith(p));

function subscribe<E extends EventChannel>(channel: E, cb: (payload: EventMap[E]) => void): () => void {
  if (!allowedEvents.has(channel) && !isExt(channel)) throw new Error(`glint: unknown event channel ${channel}`);
  const listener = (_e: IpcRendererEvent, payload: EventMap[E]) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
const on =
  <E extends EventChannel>(channel: E) =>
  (cb: (payload: EventMap[E]) => void) =>
    subscribe(channel, cb);

const api: GlintApi = {
  windowKind,
  testMode,
  overlay: {
    toggle: () => invoke('overlay:toggle'),
    show: () => invoke('overlay:show'),
    hide: () => invoke('overlay:hide'),
    getState: () => invoke('overlay:getState'),
    move: (dir) => invoke('overlay:move', dir),
    setSize: (size) => invoke('overlay:setSize', size),
    setClickThrough: (v) => invoke('overlay:setClickThrough', v),
    setInteractive: (v) => invoke('overlay:setInteractive', v),
    setContentProtection: (v) => invoke('overlay:setContentProtection', v),
    focus: () => invoke('overlay:focus'),
    showMenu: (at) => invoke('overlay:showMenu', at),
    onState: on('overlay:state'),
    onHotkey: on('hotkey'),
  },
  ask: {
    ask: (question, options) => invoke('ask:ask', { question, options }),
    quick: (kind, options) => invoke('ask:quick', { kind, options }),
    assist: (options) => invoke('ask:quick', { kind: 'assist', options }),
    whatShouldISay: (options) => invoke('ask:quick', { kind: 'whatShouldISay', options }),
    followUps: (options) => invoke('ask:quick', { kind: 'followUps', options }),
    recap: (options) => invoke('ask:quick', { kind: 'recap', options }),
    cancel: (requestId) => invoke('ask:cancel', { requestId }),
    clear: () => invoke('ask:clear'),
    onStatus: on('ask:status'),
    onChunk: on('ask:chunk'),
    onDone: on('ask:done'),
    onError: on('ask:error'),
    onCleared: on('ask:cleared'),
  },
  session: {
    start: (req) => invoke('session:start', req),
    stop: () => invoke('session:stop'),
    getStatus: () => invoke('session:getStatus'),
    onStatus: on('session:status'),
    onSegment: on('session:segment'),
    onInsights: on('session:insights'),
  },
  history: {
    list: () => invoke('history:list'),
    get: (id) => invoke('history:get', { id }),
    resume: (id) => invoke('history:resume', { id }),
    copyTranscript: (id) => invoke('history:copyTranscript', { id }),
    copySummary: (id) => invoke('history:copySummary', { id }),
    onChanged: on('history:changed'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    keybinds: () => invoke('settings:keybinds'),
    onChanged: on('settings:changed'),
  },
  app: {
    info: () => invoke('app:info'),
    copyText: (text) => invoke('app:copyText', { text }),
    openDashboard: (req) => invoke('dashboard:open', req),
    quit: () => invoke('app:quit'),
    onDashboardNavigate: on('dashboard:navigate'),
    onProtection: on('window:protection'),
  },
  ext: {
    invoke: (channel, req) => {
      if (!isExt(channel)) return Promise.resolve({ ok: false, error: { code: 'BAD_REQUEST', message: `not an ext channel: ${channel}` } });
      return invoke(channel, req);
    },
    on: (channel, cb) => {
      if (!isExt(channel)) throw new Error(`glint: not an ext channel ${channel}`);
      return subscribe(channel, cb);
    },
  },
  test: {
    getWindowState: (window) => invoke('test:getWindowState', window ? { window } : undefined),
    triggerHotkey: (id, direction) => invoke('test:triggerHotkey', { id, direction }),
  },
};

contextBridge.exposeInMainWorld('glint', api);

// ----- Built-in behaviour every Glint page gets, independent of renderer code -----

function onDom(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

onDom(() => {
  document.documentElement.dataset.glintWindow = windowKind;
  // D-S10: the dashboard window has native macOS vibrancy behind a transparent page.
  if (vibrancy) document.documentElement.classList.add('glint-vibrancy');
});

// F42: `html.glint-protected` while "Hide from screen share" is on (renderer CSS draws the dashed border).
subscribe('window:protection', ({ enabled }) => {
  onDom(() => document.documentElement.classList.toggle('glint-protected', enabled));
});

if (windowKind === 'overlay') {
  subscribe('overlay:state', (s: OverlayState) => {
    onDom(() => document.documentElement.classList.toggle('glint-click-through', s.clickThrough));
  });

  // D-S5 hover regions: transparent parts of the overlay window let clicks through to the app below.
  // The pointer counts as "over content" unless it is on <html>/<body> or inside [data-glint-passthrough].
  // A renderer that wants to manage this itself sets <html data-glint-hover="manual">.
  let lastInteractive: boolean | null = null;
  window.addEventListener(
    'mousemove',
    (e) => {
      if (document.documentElement.dataset.glintHover === 'manual') return;
      const t = e.target as Element | null;
      const interactive =
        !!t && t !== document.documentElement && t !== document.body && !t.closest?.('[data-glint-passthrough]');
      if (interactive !== lastInteractive) {
        lastInteractive = interactive;
        void invoke('overlay:setInteractive', interactive);
      }
    },
    { passive: true },
  );
}

import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type {
  DashboardOpenRequest,
  MoveDirection,
  OverlayState,
  WindowKind,
  WindowState,
} from '../shared/contract';
import { log } from './context';

// D-S3: 'screen-saver' keeps the bar above full-screen apps (Zoom/Keynote) and other floating utilities.
export const OVERLAY_LEVEL = 'screen-saver' as const;
const OVERLAY_INITIAL = { width: 720, height: 72 };
const OVERLAY_MIN = { width: 280, height: 40 };
const OVERLAY_TOP_GAP = 8;
const MOVE_STEP = 40;

const distDir = join(__dirname, '..');
const preloadPath = join(distDir, 'preload/preload.js');
const rendererFile = (name: string) => join(distDir, 'renderer', name);

// D-S10: native NSVisualEffectView behind the dashboard so the history sidebar can be translucent.
// macOS only; the preload adds html.glint-vibrancy so the renderer paints the note pane opaque itself.
const DASHBOARD_VIBRANCY = process.platform === 'darwin';
// 'active', not 'followWindow': followWindow turned the sidebar flat grey whenever the window lost focus (S9).
export const DASHBOARD_VISUAL_EFFECT_STATE = 'active' as const;

type Listener = () => void;

export class WindowManager {
  overlay: BrowserWindow | null = null;
  dashboard: BrowserWindow | null = null;

  private clickThrough = false;
  private pointerOverContent = true;
  private ignoreMouse = false;
  private protection: boolean;
  private quitting = false;
  private overlayLevel: string | null = null;
  private stateListeners = new Set<Listener>();
  private visibilityListeners = new Set<(visible: boolean) => void>();

  constructor(
    initialProtection: boolean,
    private testMode = false,
  ) {
    this.protection = initialProtection;
  }

  private args(kind: WindowKind, extra: string[] = []): string[] {
    return [`--glint-window=${kind}`, ...(this.testMode ? ['--glint-test'] : []), ...extra];
  }

  get(kind: WindowKind): BrowserWindow | null {
    const w = kind === 'overlay' ? this.overlay : this.dashboard;
    return w && !w.isDestroyed() ? w : null;
  }

  setQuitting(): void {
    this.quitting = true;
  }

  onStateChange(fn: Listener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onVisibilityChange(fn: (visible: boolean) => void): () => void {
    this.visibilityListeners.add(fn);
    return () => this.visibilityListeners.delete(fn);
  }

  private notify(): void {
    const ov = this.get('overlay');
    if (ov) ov.webContents.send('overlay:state', this.overlayState());
    for (const fn of this.stateListeners) fn();
  }

  // ----- overlay -----

  createOverlay(): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay();
    const { width, height } = OVERLAY_INITIAL;
    const win = new BrowserWindow({
      width,
      height,
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: workArea.y + OVERLAY_TOP_GAP,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      title: 'Glint',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        additionalArguments: this.args('overlay'),
      },
    });
    this.overlay = win;

    // skipTransformProcessType keeps Glint a normal Dock app (no hiding from the Dock; E2).
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    this.applyLevel();
    win.setContentProtection(this.protection);

    win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault();
        this.hideOverlay();
      }
    });
    win.on('closed', () => {
      this.overlay = null;
    });
    win.on('moved', () => this.notify());
    // macOS does not reliably emit 'show' for showInactive(), so show/hide paths also call syncVisibility().
    win.on('show', () => this.syncVisibility());
    win.on('hide', () => this.syncVisibility());
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('window:protection', { enabled: this.protection });
      win.webContents.send('overlay:state', this.overlayState());
    });
    win.once('ready-to-show', () => this.showOverlay());

    void win.loadFile(rendererFile('overlay.html'));
    return win;
  }

  private lastVisible: boolean | null = null;

  /** Fires visibility listeners once per real change (hotkey registration depends on this). */
  private syncVisibility(): void {
    const visible = !!this.get('overlay')?.isVisible();
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    if (visible) this.applyLevel();
    for (const fn of this.visibilityListeners) fn(visible);
    this.notify();
  }

  private applyLevel(): void {
    const ov = this.get('overlay');
    if (!ov) return;
    ov.setAlwaysOnTop(true, OVERLAY_LEVEL);
    this.overlayLevel = OVERLAY_LEVEL;
  }

  overlayState(): OverlayState {
    const ov = this.get('overlay');
    return {
      visible: !!ov?.isVisible(),
      bounds: ov ? ov.getBounds() : { x: 0, y: 0, width: 0, height: 0 },
      clickThrough: this.clickThrough,
      ignoreMouseEvents: this.ignoreMouse,
      contentProtection: ov ? ov.isContentProtected() : this.protection,
    };
  }

  showOverlay(): OverlayState {
    const ov = this.get('overlay');
    if (ov && !ov.isVisible()) ov.showInactive(); // don't steal focus from the meeting app
    this.syncVisibility();
    return this.overlayState();
  }

  hideOverlay(): OverlayState {
    const ov = this.get('overlay');
    if (ov && ov.isVisible()) ov.hide();
    this.syncVisibility();
    return this.overlayState();
  }

  toggleOverlay(): OverlayState {
    return this.get('overlay')?.isVisible() ? this.hideOverlay() : this.showOverlay();
  }

  focusOverlay(): OverlayState {
    const ov = this.get('overlay');
    if (ov) {
      if (!ov.isVisible()) ov.show();
      ov.focus();
      this.syncVisibility();
    }
    return this.overlayState();
  }

  moveOverlay(by: MoveDirection | { dx: number; dy: number }): OverlayState {
    const ov = this.get('overlay');
    if (!ov) return this.overlayState();
    const d =
      typeof by === 'string'
        ? { up: { dx: 0, dy: -MOVE_STEP }, down: { dx: 0, dy: MOVE_STEP }, left: { dx: -MOVE_STEP, dy: 0 }, right: { dx: MOVE_STEP, dy: 0 } }[by]
        : by;
    if (!d || !Number.isFinite(d.dx) || !Number.isFinite(d.dy)) return this.overlayState();
    const b = ov.getBounds();
    const target = { ...b, x: Math.round(b.x + d.dx), y: Math.round(b.y + d.dy) };
    ov.setBounds(this.clampToDisplay(target, b));
    this.notify();
    return this.overlayState();
  }

  /** Resize to content, keeping the top edge and the horizontal centre fixed. */
  setOverlaySize(width: number, height: number): OverlayState {
    const ov = this.get('overlay');
    if (!ov || !Number.isFinite(width) || !Number.isFinite(height)) return this.overlayState();
    const b = ov.getBounds();
    const { workArea } = screen.getDisplayMatching(b);
    const w = Math.round(Math.min(Math.max(width, OVERLAY_MIN.width), workArea.width));
    const h = Math.round(Math.min(Math.max(height, OVERLAY_MIN.height), workArea.height - OVERLAY_TOP_GAP));
    if (w === b.width && h === b.height) return this.overlayState();
    const next = { x: Math.round(b.x + (b.width - w) / 2), y: b.y, width: w, height: h };
    ov.setBounds(this.clampToDisplay(next, b));
    this.notify();
    return this.overlayState();
  }

  private clampToDisplay(r: Rectangle, current: Rectangle): Rectangle {
    const { workArea: wa } = screen.getDisplayMatching(current);
    return {
      width: r.width,
      height: r.height,
      x: Math.min(Math.max(r.x, wa.x), wa.x + wa.width - r.width),
      y: Math.min(Math.max(r.y, wa.y), wa.y + wa.height - Math.min(r.height, wa.height)),
    };
  }

  // ----- click-through (D-S5) -----

  setClickThrough(on: boolean): OverlayState {
    this.clickThrough = on;
    log('overlay', `click-through mode ${on ? 'on' : 'off'}`);
    this.applyMouse();
    return this.overlayState();
  }

  /** Hover regions: renderer says whether the pointer is over visible content. */
  setInteractive(on: boolean): OverlayState {
    this.pointerOverContent = on;
    this.applyMouse();
    return this.overlayState();
  }

  private applyMouse(): void {
    const ov = this.get('overlay');
    if (!ov) return;
    const ignore = this.clickThrough || !this.pointerOverContent;
    if (ignore !== this.ignoreMouse) {
      // forward:true keeps mousemove flowing so the renderer can detect hovering back onto content.
      ov.setIgnoreMouseEvents(ignore, ignore ? { forward: true } : undefined);
      this.ignoreMouse = ignore;
    }
    this.notify();
  }

  get isClickThrough(): boolean {
    return this.clickThrough;
  }

  // ----- content protection (D-S2) -----

  get contentProtection(): boolean {
    return this.protection;
  }

  setContentProtection(on: boolean): void {
    this.protection = on;
    for (const kind of ['overlay', 'dashboard'] as const) {
      const w = this.get(kind);
      if (!w) continue;
      w.setContentProtection(on);
      w.webContents.send('window:protection', { enabled: on });
    }
    log('windows', `hide from screen share (content protection) ${on ? 'ON' : 'OFF'} on all windows`);
    this.notify();
  }

  // ----- dashboard -----

  openDashboard(req: DashboardOpenRequest = {}): BrowserWindow {
    const existing = this.get('dashboard');
    if (existing) {
      existing.show();
      existing.focus();
      if (req.view || req.sessionId) existing.webContents.send('dashboard:navigate', req);
      return existing;
    }
    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 760,
      minHeight: 520,
      title: 'Glint',
      titleBarStyle: 'hiddenInset',
      ...(DASHBOARD_VIBRANCY
        ? { vibrancy: 'sidebar' as const, visualEffectState: DASHBOARD_VISUAL_EFFECT_STATE, backgroundColor: '#00000000' }
        : { backgroundColor: '#fafafa' }),
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        additionalArguments: this.args('dashboard', DASHBOARD_VIBRANCY ? ['--glint-vibrancy'] : []),
      },
    });
    this.dashboard = win;
    win.setContentProtection(this.protection);
    win.on('closed', () => {
      this.dashboard = null;
      this.notify();
    });
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('window:protection', { enabled: this.protection });
    });
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    const query: Record<string, string> = {};
    if (req.view) query.view = req.view;
    if (req.sessionId) query.sessionId = req.sessionId;
    void win.loadFile(rendererFile('dashboard.html'), { query });
    this.notify();
    return win;
  }

  // ----- test introspection -----

  windowState(kind: WindowKind): WindowState | null {
    const w = this.get(kind);
    if (!w) return null;
    return {
      visible: w.isVisible(),
      bounds: w.getBounds(),
      alwaysOnTop: w.isAlwaysOnTop(),
      alwaysOnTopLevel: kind === 'overlay' ? this.overlayLevel : w.isAlwaysOnTop() ? 'floating' : null,
      contentProtection: w.isContentProtected(),
      ignoreMouseEvents: kind === 'overlay' ? this.ignoreMouse : false,
      focused: w.isFocused(),
    };
  }
}

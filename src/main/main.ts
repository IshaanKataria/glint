import { app, clipboard, nativeImage, nativeTheme } from 'electron';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { CORE_INVOKE_CHANNELS, type InvokeChannel, type WindowKind } from '../shared/contract';
import { createContext, GlintError, log } from './context';
import { Hotkeys } from './hotkeys';
import { describeKeySource } from './secrets';
import { SettingsStore } from './settings';
import { createTray, setAppMenu, showOverlayMenu, type ShellActions } from './tray';
import { WindowManager } from './windows';
import { register as registerAi } from '../ai/index';
import { register as registerAudio } from '../audio/index';
import { register as registerSessions } from '../sessions/index';

app.setName('Glint');

const TEST = process.env.GLINT_TEST === '1';
const absolute = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));

if (!TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

async function start(): Promise<void> {
  await app.whenReady();
  // D-S10: one light native appearance (F73), so the dashboard's vibrancy material is the light sidebar
  // from the reference even when macOS is in Dark mode. Renderers set their own color-scheme in CSS.
  nativeTheme.themeSource = 'light';

  // D-S7: data dir and settings location.
  const dataDir = process.env.GLINT_DATA_DIR ? absolute(process.env.GLINT_DATA_DIR) : join(app.getPath('userData'), 'sessions');
  mkdirSync(dataDir, { recursive: true });
  const settingsFile = process.env.GLINT_DATA_DIR ? join(dataDir, 'settings.json') : join(app.getPath('userData'), 'settings.json');
  const settings = new SettingsStore(settingsFile);
  const audioFile = process.env.GLINT_AUDIO_FILE ? absolute(process.env.GLINT_AUDIO_FILE) : undefined;

  const windows = new WindowManager(settings.get().hideFromScreenShare, TEST);
  const ctx = createContext({
    dataDir,
    projectRoot: app.getAppPath(),
    flags: { test: TEST, audioFile },
    getSettings: () => settings.get(),
    getWindow: (k: WindowKind) => windows.get(k),
  });
  const hotkeys = new Hotkeys(ctx, windows);

  log('main', `Glint ${app.getVersion()} electron ${process.versions.electron} test=${TEST} dataDir=${dataDir}`);
  log('main', `audio source override: ${audioFile ?? 'none (microphone)'}`);
  log('main', `DeepSeek key: ${describeKeySource()}`); // source only, never the value

  const actions: ShellActions = {
    setHideFromScreenShare: (on) => settings.set({ hideFromScreenShare: on }),
    quit: () => app.quit(),
  };
  settings.onChange((s) => {
    if (s.hideFromScreenShare !== windows.contentProtection) windows.setContentProtection(s.hideFromScreenShare);
    ctx.emit('settings:changed', s);
    ctx.bus.emit('settings:changed', s);
  });

  // ----- Shell IPC -----
  ctx.handle('overlay:toggle', () => windows.toggleOverlay());
  ctx.handle('overlay:show', () => windows.showOverlay());
  ctx.handle('overlay:hide', () => windows.hideOverlay());
  ctx.handle('overlay:getState', () => windows.overlayState());
  ctx.handle('overlay:move', (dir) => windows.moveOverlay(dir));
  ctx.handle('overlay:setSize', (s) => windows.setOverlaySize(s.width, s.height));
  ctx.handle('overlay:setClickThrough', (on) => windows.setClickThrough(!!on));
  ctx.handle('overlay:setInteractive', (on) => windows.setInteractive(!!on));
  ctx.handle('overlay:setContentProtection', (on) => {
    settings.set({ hideFromScreenShare: !!on });
    return windows.overlayState();
  });
  ctx.handle('overlay:focus', () => windows.focusOverlay());
  ctx.handle('overlay:showMenu', (at) => showOverlayMenu(windows, actions, at ?? undefined));

  ctx.handle('settings:get', () => settings.get());
  ctx.handle('settings:set', (patch) => settings.set(patch ?? {}));
  ctx.handle('settings:keybinds', () => hotkeys.list());

  ctx.handle('app:info', (_req, e) => ({
    version: app.getVersion(),
    platform: process.platform,
    testMode: TEST,
    dataDir,
    windowKind: e && windows.get('dashboard')?.webContents.id === e.sender.id ? 'dashboard' : 'overlay',
  }));
  ctx.handle('app:copyText', ({ text }) => {
    clipboard.writeText(String(text ?? ''));
    return { chars: String(text ?? '').length };
  });
  ctx.handle('dashboard:open', (req) => {
    windows.openDashboard(req ?? {});
  });
  ctx.handle('app:quit', () => {
    setTimeout(() => app.quit(), 0);
  });

  ctx.handle('test:getWindowState', (req) => {
    if (!TEST) throw new GlintError('TEST_ONLY', 'test:getWindowState needs GLINT_TEST=1');
    const kind = req?.window ?? 'overlay';
    const st = windows.windowState(kind);
    if (!st) throw new GlintError('NOT_FOUND', `${kind} window is not open`);
    return st;
  });
  ctx.handle('test:triggerHotkey', async ({ id, direction }) => {
    if (!TEST) throw new GlintError('TEST_ONLY', 'test:triggerHotkey needs GLINT_TEST=1');
    await hotkeys.run(id, direction);
  });

  // ----- Service modules (AI, Audio, Sessions own these files) -----
  for (const [name, register] of [['ai', registerAi], ['audio', registerAudio], ['sessions', registerSessions]] as const) {
    try {
      register(ctx);
    } catch (err) {
      log('main', `${name}.register failed:`, (err as Error).message);
    }
  }
  const missing = CORE_INVOKE_CHANNELS.filter((c) => !ctx.registered.has(c));
  for (const c of missing) {
    ctx.handle(c as InvokeChannel, () => {
      throw new GlintError('NOT_IMPLEMENTED', `${c} has no handler`);
    });
  }
  if (missing.length) log('main', `no handler registered for: ${missing.join(', ')} (NOT_IMPLEMENTED fallback)`);

  // ----- Windows, tray, hotkeys -----
  setAppMenu(windows);
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '..', 'assets', 'icon.png')));
  windows.onVisibilityChange((v) => hotkeys.setOverlayVisible(v));
  windows.createOverlay();
  createTray(windows, actions);
  hotkeys.registerAlways();
  log('main', `hide from screen share default: ${windows.contentProtection ? 'ON' : 'OFF'}`);

  app.on('activate', () => windows.openDashboard({ view: 'history' }));
  app.on('second-instance', () => windows.showOverlay());
  app.on('before-quit', () => windows.setQuitting());
  app.on('will-quit', () => hotkeys.dispose());
  app.on('window-all-closed', () => {
    // The overlay never closes (it hides), so keep running until Quit.
  });

  if (TEST) {
    // For Playwright electronApp.evaluate(): main-process read-only state.
    (globalThis as Record<string, unknown>).__glintTest = {
      windowState: (k: WindowKind = 'overlay') => windows.windowState(k),
      overlayState: () => windows.overlayState(),
      keybinds: () => hotkeys.list(),
      dataDir,
    };
  }
}

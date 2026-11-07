// Checker control app: a separate Electron process (not Glint) that opens plain windows
// (markers, backdrops) at exact positions. Never content-protected. Driven from Playwright.
const { app, BrowserWindow } = require('electron');
app.setName('Checker Control');
const wins = new Map();
globalThis.openWin = async (id, { x, y, width, height, html, focus = true, frame = false, floating = false }) => {
  if (wins.has(id)) wins.get(id).destroy();
  const w = new BrowserWindow({ x, y, width, height, frame, show: false, resizable: false, hasShadow: false, backgroundColor: '#ffffff', webPreferences: { sandbox: true } });
  wins.set(id, w);
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  w.setBounds({ x, y, width, height });
  // floating: above normal app windows (e.g. a terminal the user clicks), below Glint's screen-saver-level overlay.
  if (floating) w.setAlwaysOnTop(true, 'floating');
  w.show();
  if (focus) { app.focus({ steal: true }); w.focus(); w.moveTop(); }
  return w.getBounds();
};
globalThis.closeWin = (id) => { wins.get(id)?.destroy(); wins.delete(id); };
globalThis.focusWin = (id) => { const w = wins.get(id); if (w) { app.focus({ steal: true }); w.focus(); w.moveTop(); } };
app.on('window-all-closed', () => {});
app.whenReady().then(() => console.log('[control] ready'));

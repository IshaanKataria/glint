import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import type { WindowManager } from './windows';

export interface ShellActions {
  setHideFromScreenShare(on: boolean): void;
  quit(): void;
}

const assetsDir = join(__dirname, '..', 'assets');

/** Items shared by the menu-bar tray menu and the overlay ⋮ menu. */
export function commonMenuItems(windows: WindowManager, actions: ShellActions): MenuItemConstructorOptions[] {
  const visible = !!windows.get('overlay')?.isVisible();
  return [
    { label: visible ? 'Hide Glint' : 'Show Glint', accelerator: 'Command+\\', registerAccelerator: false, click: () => windows.toggleOverlay() },
    { label: 'Open Glint', click: () => windows.openDashboard({ view: 'history' }) },
    { label: 'Settings…', click: () => windows.openDashboard({ view: 'settings' }) },
    { type: 'separator' },
    {
      label: 'Hide from screen share',
      type: 'checkbox',
      checked: windows.contentProtection,
      click: (item) => actions.setHideFromScreenShare(item.checked),
    },
    {
      label: 'Click-through',
      type: 'checkbox',
      checked: windows.isClickThrough,
      accelerator: 'Command+Alt+\\',
      registerAccelerator: false,
      click: (item) => windows.setClickThrough(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit Glint', accelerator: 'Command+Q', registerAccelerator: false, click: () => actions.quit() },
  ];
}

export function createTray(windows: WindowManager, actions: ShellActions): Tray {
  // trayTemplate.png + @2x: black-on-transparent, macOS tints it for light/dark menu bars.
  const icon = nativeImage.createFromPath(join(assetsDir, 'trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Glint');
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate(commonMenuItems(windows, actions)));
  rebuild();
  windows.onStateChange(rebuild);
  return tray;
}

export function showOverlayMenu(windows: WindowManager, actions: ShellActions, at?: { x: number; y: number }): void {
  const ov = windows.get('overlay');
  if (!ov) return;
  Menu.buildFromTemplate(commonMenuItems(windows, actions)).popup({ window: ov, x: at?.x, y: at?.y });
}

/** Minimal app menu: Edit roles are needed for copy/paste in text fields on macOS. No ⌘R reload item. */
export function setAppMenu(windows: WindowManager): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Command+,', click: () => windows.openDashboard({ view: 'settings' }) },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'toggleDevTools' }],
      },
      { role: 'windowMenu' },
    ]),
  );
}

import { globalShortcut } from 'electron';
import type { HotkeyEvent, HotkeyId, Keybind, KeybindGroup, MoveDirection } from '../shared/contract';
import { log, type ServiceContext } from './context';
import type { WindowManager } from './windows';

interface HotkeyDef {
  id: HotkeyId;
  label: string;
  group: KeybindGroup;
  keys: string[];
  /** D-S4: aggressive keys (⌘R, ⌘↵, arrows) are only grabbed while the overlay is visible. */
  scope: 'always' | 'whileVisible';
  bindings: { accelerator: string; direction?: MoveDirection }[];
}

// Exact keys from FEATURES.md F02-F08, F20 (Cluely's documented macOS defaults); ⌘⌥\ is Glint's own (D-S6).
export const HOTKEYS: HotkeyDef[] = [
  { id: 'toggleOverlay', label: 'Show or hide Glint', group: 'General', keys: ['⌘', '\\'], scope: 'always', bindings: [{ accelerator: 'Command+\\' }] },
  { id: 'askOrAssist', label: 'Ask Glint about your screen or audio', group: 'General', keys: ['⌘', '↵'], scope: 'whileVisible', bindings: [{ accelerator: 'Command+Return' }] },
  { id: 'clear', label: 'Clear the current conversation', group: 'General', keys: ['⌘', 'R'], scope: 'whileVisible', bindings: [{ accelerator: 'Command+R' }] },
  { id: 'toggleSession', label: 'Start or stop a Glint session', group: 'General', keys: ['⌘', '⇧', '\\'], scope: 'always', bindings: [{ accelerator: 'Command+Shift+\\' }] },
  { id: 'toggleClickThrough', label: 'Toggle click-through (mouse passes through the overlay)', group: 'Window', keys: ['⌘', '⌥', '\\'], scope: 'whileVisible', bindings: [{ accelerator: 'Command+Alt+\\' }] },
  {
    id: 'moveWindow', label: 'Move the window up / down / left / right', group: 'Window', keys: ['⌘', '↑/↓/←/→'], scope: 'whileVisible',
    bindings: [
      { accelerator: 'Command+Up', direction: 'up' },
      { accelerator: 'Command+Down', direction: 'down' },
      { accelerator: 'Command+Left', direction: 'left' },
      { accelerator: 'Command+Right', direction: 'right' },
    ],
  },
  {
    id: 'scrollAnswer', label: 'Scroll the response up / down', group: 'Scroll', keys: ['⌘', '⇧', '↑/↓'], scope: 'whileVisible',
    bindings: [
      { accelerator: 'Command+Shift+Up', direction: 'up' },
      { accelerator: 'Command+Shift+Down', direction: 'down' },
    ],
  },
];

export class Hotkeys {
  constructor(
    private ctx: ServiceContext,
    private windows: WindowManager,
  ) {}

  /** Runs a hotkey's action. Also used by test:triggerHotkey. */
  async run(id: HotkeyId, direction?: MoveDirection): Promise<void> {
    const w = this.windows;
    const send = (e: HotkeyEvent) => this.ctx.emit('hotkey', e, 'overlay');
    switch (id) {
      case 'toggleOverlay':
        w.toggleOverlay();
        send({ action: 'toggleOverlay' });
        break;
      case 'askOrAssist':
        w.showOverlay();
        send({ action: 'askOrAssist' });
        break;
      case 'clear':
        send({ action: 'clear' });
        break;
      case 'toggleClickThrough':
        w.setClickThrough(!w.isClickThrough);
        send({ action: 'toggleClickThrough' });
        break;
      case 'moveWindow':
        if (direction) {
          w.moveOverlay(direction);
          send({ action: 'move', direction });
        }
        break;
      case 'scrollAnswer':
        send({ action: direction === 'up' ? 'scrollUp' : 'scrollDown' });
        break;
      case 'toggleSession': {
        w.showOverlay();
        const st = await this.ctx.call('session:getStatus', undefined);
        const active = st.ok && ['starting', 'recording'].includes(st.value.state);
        const res = active ? await this.ctx.call('session:stop', undefined) : await this.ctx.call('session:start', undefined);
        if (!res.ok) {
          log('hotkeys', `session ${active ? 'stop' : 'start'} failed: ${res.error.code} ${res.error.message}`);
          this.ctx.emit('session:status', { state: 'error', message: res.error.message });
        }
        send({ action: 'toggleSession' });
        break;
      }
    }
  }

  private register(def: HotkeyDef): void {
    for (const b of def.bindings) {
      if (globalShortcut.isRegistered(b.accelerator)) continue;
      const ok = globalShortcut.register(b.accelerator, () => {
        void this.run(def.id, b.direction).catch((err) => log('hotkeys', `${def.id} failed:`, (err as Error).message));
      });
      log('hotkeys', `register ${b.accelerator} (${def.id}, ${def.scope}) -> ${ok ? 'ok' : 'FAILED'}; isRegistered=${globalShortcut.isRegistered(b.accelerator)}`);
    }
  }

  private unregister(def: HotkeyDef): void {
    for (const b of def.bindings) globalShortcut.unregister(b.accelerator);
    log('hotkeys', `unregistered ${def.bindings.map((b) => b.accelerator).join(', ')} (${def.id})`);
  }

  registerAlways(): void {
    for (const def of HOTKEYS) if (def.scope === 'always') this.register(def);
  }

  setOverlayVisible(visible: boolean): void {
    for (const def of HOTKEYS) {
      if (def.scope !== 'whileVisible') continue;
      if (visible) this.register(def);
      else this.unregister(def);
    }
  }

  list(): Keybind[] {
    return HOTKEYS.map((d) => ({
      id: d.id,
      label: d.label,
      group: d.group,
      keys: d.keys,
      scope: d.scope,
      accelerators: d.bindings.map((b) => b.accelerator),
      registered: d.bindings.every((b) => globalShortcut.isRegistered(b.accelerator)),
    }));
  }

  dispose(): void {
    globalShortcut.unregisterAll();
  }
}

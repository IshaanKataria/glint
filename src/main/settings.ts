import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../shared/contract';
import { log } from './context';

export class SettingsStore {
  private value: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(private file: string) {
    this.value = { ...DEFAULT_SETTINGS, ...this.read() };
  }

  private read(): Partial<Settings> {
    try {
      if (!existsSync(this.file)) return {};
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      const out: Partial<Settings> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (k in raw && typeof raw[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = raw[k];
      }
      return out;
    } catch (err) {
      log('settings', 'could not read settings, using defaults:', (err as Error).message);
      return {};
    }
  }

  get(): Settings {
    return { ...this.value };
  }

  set(patch: Partial<Settings>): Settings {
    const next = { ...this.value };
    for (const k of Object.keys(patch) as (keyof Settings)[]) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      if (typeof patch[k] !== typeof DEFAULT_SETTINGS[k]) continue;
      (next as Record<string, unknown>)[k] = patch[k];
    }
    this.value = next;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(next, null, 2));
    } catch (err) {
      log('settings', 'could not save settings:', (err as Error).message);
    }
    for (const fn of this.listeners) fn(this.get());
    return this.get();
  }

  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

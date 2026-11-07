// Screen capture + on-device OCR (macOS Vision via native/ocr/bin/glint-ocr; D-I3).
// Glint's own windows use content protection, so they are left out of the capture.
import { desktopCapturer, screen, systemPreferences, type Display } from 'electron';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlintError } from '../main/context';

export const SCREEN_PERMISSION_STEPS =
  'System Settings > Privacy & Security > Screen & System Audio Recording: turn on the app that launched Glint (Electron when run from a terminal, or T3 Code / your terminal app), then quit and relaunch Glint.';

export interface OcrResult {
  text: string;
  lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[];
  width: number;
  height: number;
  ms: number;
  engine: 'vision' | 'tesseract';
}

export interface ScreenText extends OcrResult {
  captureMs: number;
  displayId: number;
  /** systemPreferences.getMediaAccessStatus('screen') at capture time. */
  permission: string;
}

interface Deps {
  projectRoot: string;
  childEnv(): NodeJS.ProcessEnv;
  log(...args: unknown[]): void;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env, timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const TESSERACT = ['/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract'];

export class ScreenOcr {
  private building: Promise<string | null> | null = null;

  constructor(private deps: Deps) {}

  private get helperDir() {
    return join(this.deps.projectRoot, 'native', 'ocr');
  }

  /** Path to the Vision helper, building it with swiftc if missing or older than its source. */
  ensureHelper(): Promise<string | null> {
    if (this.building) return this.building;
    this.building = (async () => {
      const bin = join(this.helperDir, 'bin', 'glint-ocr');
      const src = join(this.helperDir, 'glint_ocr.swift');
      const stale = !existsSync(bin) || (existsSync(src) && statSync(src).mtimeMs > statSync(bin).mtimeMs);
      if (!stale) return bin;
      if (!existsSync(join(this.helperDir, 'build.sh'))) return existsSync(bin) ? bin : null;
      const t = Date.now();
      try {
        await run('/bin/sh', [join(this.helperDir, 'build.sh')], this.deps.childEnv(), 180_000);
        this.deps.log(`built Vision OCR helper in ${Date.now() - t} ms`);
        return bin;
      } catch (err) {
        this.deps.log('Vision OCR helper build failed, will fall back to tesseract:', (err as { stderr?: string }).stderr?.slice(0, 300) ?? (err as Error).message);
        return existsSync(bin) ? bin : null;
      }
    })();
    void this.building.then((b) => {
      if (!b) this.building = null; // allow a later retry
    });
    return this.building;
  }

  async recognize(imagePath: string): Promise<OcrResult> {
    const helper = await this.ensureHelper();
    if (helper) {
      try {
        const { stdout } = await run(helper, [imagePath], this.deps.childEnv());
        const parsed = JSON.parse(stdout) as Omit<OcrResult, 'engine'>;
        return { ...parsed, engine: 'vision' };
      } catch (err) {
        this.deps.log('Vision OCR failed, trying tesseract:', (err as Error).message.slice(0, 200));
      }
    }
    const tess = TESSERACT.find((p) => existsSync(p));
    if (!tess) throw new GlintError('INTERNAL', 'No OCR engine available (Vision helper failed to build and tesseract is not installed)');
    const t = Date.now();
    const { stdout } = await run(tess, [imagePath, 'stdout'], this.deps.childEnv());
    return { text: stdout.trim(), lines: [], width: 0, height: 0, ms: Date.now() - t, engine: 'tesseract' };
  }

  /**
   * Captures the display the overlay is on (or the one under the cursor) and OCRs it.
   * Throws PERMISSION_DENIED without Screen Recording permission; never answers blind.
   */
  async captureAndRecognize(near?: { x: number; y: number }, onCaptured?: () => void): Promise<ScreenText> {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status === 'denied' || status === 'restricted') {
      throw new GlintError('PERMISSION_DENIED', `Screen Recording permission is ${status}. ${SCREEN_PERMISSION_STEPS}`);
    }
    const display: Display = screen.getDisplayNearestPoint(near ?? screen.getCursorScreenPoint());
    const t0 = Date.now();
    const dir = mkdtempSync(join(tmpdir(), 'glint-shot-'));
    const file = join(dir, 'screen.png');
    try {
      const size = {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      };
      let png: Buffer | null = null;
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
        const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
        if (src && !src.thumbnail.isEmpty()) png = src.thumbnail.toPNG();
        else this.deps.log(`desktopCapturer returned ${sources.length} sources, empty thumbnail (permission status: ${status})`);
      } catch (err) {
        this.deps.log('desktopCapturer failed, falling back to screencapture:', (err as Error).message);
      }
      if (png) {
        writeFileSync(file, png);
      } else {
        try {
          await run('/usr/sbin/screencapture', ['-x', '-t', 'png', file], this.deps.childEnv(), 15_000);
        } catch (err) {
          throw new GlintError('PERMISSION_DENIED', `Could not capture the screen (${(err as { stderr?: string }).stderr?.trim() || (err as Error).message}). ${SCREEN_PERMISSION_STEPS}`);
        }
        if (!existsSync(file) || statSync(file).size === 0) {
          throw new GlintError('PERMISSION_DENIED', `Screen capture produced no image. ${SCREEN_PERMISSION_STEPS}`);
        }
      }
      const captureMs = Date.now() - t0;
      onCaptured?.();
      const ocr = await this.recognize(file);
      if (process.env.GLINT_KEEP_SCREENSHOT) {
        // Test/debug aid: keep the capture next to the given path (never on by default).
        try {
          copyFileSync(file, process.env.GLINT_KEEP_SCREENSHOT);
        } catch {
          /* ignore */
        }
      }
      return { ...ocr, captureMs, displayId: display.id, permission: status };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// The key lives only in this closure. It is never logged, written, or put in an error message.
let cached: string | undefined;
let attempted = false;

const FISH_CANDIDATES = ['fish', '/opt/homebrew/bin/fish', '/usr/local/bin/fish'];

function readFromFish(): string | undefined {
  for (const bin of FISH_CANDIDATES) {
    if (bin.startsWith('/') && !existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ['-c', 'printf %s "$DEEPSEEK_API_KEY"'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out) return out;
    } catch {
      // try the next candidate; never surface the command output
    }
  }
  return undefined;
}

/** Returns the DeepSeek key, or undefined. Tries process.env, then fish once. */
export function getDeepSeekKey(): string | undefined {
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (!attempted) {
    attempted = true;
    cached = readFromFish();
  }
  return cached;
}

/** Safe to log: says whether a key is available and where it came from, never the value. */
export function describeKeySource(): string {
  if (process.env.DEEPSEEK_API_KEY?.trim()) return 'env';
  return getDeepSeekKey() ? 'fish' : 'missing';
}

/** process.env copy without the key, for child processes that do not need it (WhisperX, OCR). */
export function envWithoutSecrets(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DEEPSEEK_API_KEY;
  return env;
}

// DeepSeek client: OpenAI-compatible chat completions with SSE streaming, timeouts,
// cancellation and error mapping. Uses Node's built-in fetch. The API key is passed in
// per call and never logged, stored, or placed in an error message (D-I2).
import { GlintError } from '../main/context';

export const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Stream deltas through onDelta. Default true when onDelta is given. */
  onDelta?: (text: string) => void;
  /** Called once when the model starts streaming hidden reasoning (thinking models). */
  onReasoningStart?: () => void;
  /** Model "thinking" (reasoning_content). Default false: faster first token (D-I1). */
  thinking?: boolean;
  /** response_format json_object. The prompt must ask for JSON. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Max wait for response headers. Default 30 s. */
  connectTimeoutMs?: number;
  /** Max silence between stream chunks. Default 45 s. */
  idleTimeoutMs?: number;
  /** Hard cap for the whole call. Default 180 s. */
  totalTimeoutMs?: number;
  /** Retries for 429/5xx/network errors before any text was streamed. Default 1. */
  retries?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage?: ChatUsage;
  ms: number;
}

/** Removes anything key-like from upstream text (DeepSeek echoes "api key: ****abcd"). */
export function scrub(text: string, key?: string): string {
  let out = text;
  if (key && key.length >= 8) out = out.split(key).join('[redacted]');
  return out
    .replace(/api[ _-]?key\s*[:=]?\s*\S+/gi, 'api key [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
}

type Abort = 'user' | 'connect' | 'idle' | 'total';

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

function errorForStatus(status: number, upstream: string): GlintError {
  const detail = upstream ? `: ${upstream}` : '';
  if (status === 401 || status === 403) return new GlintError('NO_API_KEY', `DeepSeek rejected the API key (HTTP ${status}). Check DEEPSEEK_API_KEY.`);
  if (status === 402) return new GlintError('UPSTREAM', 'DeepSeek account has insufficient balance (HTTP 402).');
  if (status === 429) return new GlintError('BUSY', `DeepSeek rate limit hit (HTTP 429)${detail}`);
  if (status === 400 || status === 422) return new GlintError('BAD_REQUEST', `DeepSeek refused the request (HTTP ${status})${detail}`);
  return new GlintError('UPSTREAM', `DeepSeek error (HTTP ${status})${detail}`);
}

const retryable = (e: unknown) =>
  e instanceof GlintError ? e.code === 'BUSY' || (e.code === 'UPSTREAM' && !/balance/.test(e.message)) : true;

export class DeepSeekClient {
  constructor(
    private getKey: () => string | undefined,
    private log: (...args: unknown[]) => void = () => {},
  ) {}

  hasKey(): boolean {
    return !!this.getKey();
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const retries = req.retries ?? 1;
    let attempt = 0;
    for (;;) {
      let streamed = false;
      try {
        return await this.once(req, () => (streamed = true));
      } catch (err) {
        const canRetry = attempt < retries && !streamed && !req.signal?.aborted && retryable(err) && !(err instanceof GlintError && err.code === 'CANCELLED');
        if (!canRetry) throw err;
        attempt++;
        const wait = 800 * attempt;
        this.log(`retry ${attempt}/${retries} after: ${(err as Error).message} (waiting ${wait} ms)`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  private async once(req: ChatRequest, markStreamed: () => void): Promise<ChatResult> {
    const key = this.getKey();
    if (!key) throw new GlintError('NO_API_KEY', 'No DeepSeek API key: set DEEPSEEK_API_KEY (env or fish universal variable).');
    const started = Date.now();
    const stream = !!req.onDelta;

    const ctrl = new AbortController();
    let reason: Abort | null = null;
    const abort = (r: Abort) => {
      if (!reason) reason = r;
      ctrl.abort();
    };
    const onUserAbort = () => abort('user');
    if (req.signal?.aborted) throw new GlintError('CANCELLED', 'Request cancelled');
    req.signal?.addEventListener('abort', onUserAbort, { once: true });
    const total = setTimeout(() => abort('total'), req.totalTimeoutMs ?? 180_000);
    let idle: NodeJS.Timeout | undefined;
    const armIdle = (ms: number, r: Abort) => {
      clearTimeout(idle);
      idle = setTimeout(() => abort(r), ms);
    };
    armIdle(req.connectTimeoutMs ?? 30_000, 'connect');

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream,
      thinking: { type: req.thinking ? 'enabled' : 'disabled' },
    };
    if (stream) body.stream_options = { include_usage: true };
    if (req.json) body.response_format = { type: 'json_object' };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    const mapAbort = (): GlintError => {
      switch (reason) {
        case 'user':
          return new GlintError('CANCELLED', 'Request cancelled');
        case 'connect':
          return new GlintError('UPSTREAM', `DeepSeek did not respond within ${secs(req.connectTimeoutMs ?? 30_000)}`);
        case 'idle':
          return new GlintError('UPSTREAM', 'DeepSeek stream stalled (no data for too long)');
        default:
          return new GlintError('UPSTREAM', `DeepSeek request timed out after ${secs(req.totalTimeoutMs ?? 180_000)}`);
      }
    };

    try {
      let res: Response;
      try {
        res = await fetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (err) {
        if (reason) throw mapAbort();
        throw new GlintError('UPSTREAM', `Network error reaching DeepSeek: ${scrub((err as Error).message, key)}`);
      }

      if (!res.ok) {
        let upstream = '';
        try {
          const text = await res.text();
          upstream = scrub((JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text, key);
        } catch {
          // body unreadable; the status code is enough
        }
        throw errorForStatus(res.status, upstream);
      }

      if (!stream) {
        armIdle(req.totalTimeoutMs ?? 180_000, 'total');
        const json = (await res.json()) as {
          model?: string;
          choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const choice = json.choices?.[0];
        return {
          content: choice?.message?.content ?? '',
          model: json.model ?? req.model,
          finishReason: choice?.finish_reason ?? null,
          usage: json.usage ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 } : undefined,
          ms: Date.now() - started,
        };
      }

      // SSE: lines of `data: {json}` separated by blank lines, terminated by `data: [DONE]`.
      const idleMs = req.idleTimeoutMs ?? 45_000;
      armIdle(idleMs, 'idle');
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let content = '';
      let model = req.model;
      let finishReason: string | null = null;
      let usage: ChatUsage | undefined;
      let reasoningSeen = false;
      let done = false;
      while (!done) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (reason) throw mapAbort();
          throw new GlintError('UPSTREAM', `DeepSeek stream broke: ${scrub((err as Error).message, key)}`);
        }
        if (chunk.done) break;
        armIdle(idleMs, 'idle');
        buf += decoder.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue; // comments / keep-alives
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            done = true;
            break;
          }
          let evt: {
            model?: string;
            error?: { message?: string };
            choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };
          try {
            evt = JSON.parse(data);
          } catch {
            continue;
          }
          if (evt.error) throw new GlintError('UPSTREAM', `DeepSeek stream error: ${scrub(evt.error.message ?? 'unknown', key)}`);
          if (evt.model) model = evt.model;
          if (evt.usage) usage = { promptTokens: evt.usage.prompt_tokens ?? 0, completionTokens: evt.usage.completion_tokens ?? 0 };
          const c = evt.choices?.[0];
          if (!c) continue;
          if (c.delta?.reasoning_content && !reasoningSeen) {
            reasoningSeen = true;
            req.onReasoningStart?.();
          }
          const d = c.delta?.content;
          if (d) {
            content += d;
            markStreamed();
            req.onDelta!(d);
          }
          if (c.finish_reason) finishReason = c.finish_reason;
        }
      }
      return { content, model, finishReason, usage, ms: Date.now() - started };
    } catch (err) {
      if (reason && !(err instanceof GlintError && err.code !== 'INTERNAL')) throw mapAbort();
      if (reason === 'user') throw mapAbort();
      throw err;
    } finally {
      clearTimeout(total);
      clearTimeout(idle);
      req.signal?.removeEventListener('abort', onUserAbort);
    }
  }
}

/** Parses a JSON object out of a model reply (tolerates ```json fences or leading prose). */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const a = trimmed.indexOf('{');
    const b = trimmed.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(trimmed.slice(a, b + 1)) as T;
    throw new GlintError('UPSTREAM', 'DeepSeek returned malformed JSON');
  }
}

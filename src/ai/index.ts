// AI module: Ask (typed questions + quick actions, with OCR screen context and the live
// transcript), the conversation thread (follow-ups, ⌘R clear), and Live Insights.
import { randomUUID } from 'node:crypto';
import { GlintError, toErrorInfo, type ServiceContext } from '../main/context';
import type { AnswerMeta, AskOptions, AskStage, InsightAction, QuickActionKind } from '../shared/contract';
import { ScreenOcr } from '../ocr/index';
import { getLiveSession } from '../sessions/index';
import { transcriptTail } from '../sessions/store';
import { DeepSeekClient, type ChatMessage } from './deepseek';
import { LiveInsightsEngine } from './insights';
import { buildContextBlock, insightPrompt, QUICK_LABELS, QUICK_PROMPTS, SYSTEM_PROMPT } from './prompts';

/** Limits on what goes into one request (D-I6). */
const LIMITS = {
  screenChars: 12_000,
  transcriptChars: 24_000,
  /** Earlier turns kept in the thread for follow-ups. */
  threadTurns: 6,
  /** Earlier turns' user content (with their old screen text) is cut to this. */
  oldTurnChars: 6_000,
  maxAnswerTokens: 3_000,
};

const QUICK_KINDS: QuickActionKind[] = ['assist', 'whatShouldISay', 'followUps', 'recap'];

interface Turn {
  user: string;
  assistant: string;
}

interface Active {
  requestId: string;
  ctrl: AbortController;
}

export function register(ctx: ServiceContext): void {
  const log = (...a: unknown[]) => ctx.log('ai', ...a);
  const client = new DeepSeekClient(() => ctx.getDeepSeekKey(), log);
  const ocr = new ScreenOcr({ projectRoot: ctx.projectRoot, childEnv: () => ctx.childEnv(), log: (...a) => ctx.log('ocr', ...a) });
  const insights = new LiveInsightsEngine({
    client,
    model: () => ctx.getSettings().liveModel || 'deepseek-flash',
    emit: (p) => ctx.emit('session:insights', p),
    log,
  });

  let thread: Turn[] = [];
  let active: Active | null = null;

  // Build the Vision helper in the background so the first screenshot ask doesn't wait for swiftc.
  void ocr.ensureHelper();

  const stage = (requestId: string, s: AskStage) => ctx.emit('ask:status', { requestId, stage: s }, 'overlay');

  function cancelActive(why: string): void {
    if (!active) return;
    const { requestId, ctrl } = active;
    active = null;
    ctrl.abort();
    ctx.emit('ask:error', { requestId, error: { code: 'CANCELLED', message: why } }, 'overlay');
  }

  function overlayCenter(): { x: number; y: number } | undefined {
    const w = ctx.getWindow('overlay');
    if (!w || w.isDestroyed()) return undefined;
    const b = w.getBounds();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }

  interface AskJob {
    kind: AnswerMeta['kind'];
    /** Pill text. */
    question: string;
    /** What the model is asked to do (question, quick-action prompt, or insight prompt). */
    instruction: string;
    options: AskOptions;
    withScreenshot: boolean;
  }

  function start(job: AskJob): { requestId: string } {
    cancelActive('Superseded by a new question');
    const requestId = randomUUID();
    const ctrl = new AbortController();
    active = { requestId, ctrl };
    void process(requestId, ctrl, job);
    return { requestId };
  }

  async function process(requestId: string, ctrl: AbortController, job: AskJob): Promise<void> {
    const startedAt = Date.now();
    const settings = ctx.getSettings();
    const live = getLiveSession();
    const sessionId = live?.id;
    try {
      if (!client.hasKey()) throw new GlintError('NO_API_KEY', 'No DeepSeek API key: set DEEPSEEK_API_KEY (env or fish universal variable).');

      let screen: string | undefined;
      let ocrChars = 0;
      if (job.withScreenshot) {
        stage(requestId, 'capturing');
        const shot = await ocr.captureAndRecognize(overlayCenter(), () => !ctrl.signal.aborted && stage(requestId, 'ocr'));
        if (ctrl.signal.aborted) return;
        screen = shot.text.length > LIMITS.screenChars ? shot.text.slice(0, LIMITS.screenChars) + '\n[...screen text truncated...]' : shot.text;
        ocrChars = screen.length;
        log(`screen: display ${shot.displayId} ${shot.width}x${shot.height}, capture ${shot.captureMs} ms, ${shot.engine} OCR ${shot.ms} ms, ${shot.text.length} chars`);
      }

      const transcript =
        job.options.includeTranscript !== false && live && live.segments.length ? transcriptTail([...live.segments], LIMITS.transcriptChars) : undefined;

      const userContent = `${buildContextBlock({ screen, transcript })}\n\n${job.instruction}`;
      const history: ChatMessage[] = thread.slice(-LIMITS.threadTurns).flatMap((t) => [
        { role: 'user' as const, content: t.user.length > LIMITS.oldTurnChars ? t.user.slice(0, LIMITS.oldTurnChars) + '\n[...]' : t.user },
        { role: 'assistant' as const, content: t.assistant },
      ]);
      const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history, { role: 'user', content: userContent }];

      stage(requestId, 'thinking');
      let streaming = false;
      const model = settings.answerModel || 'deepseek-v4-pro';
      const res = await client.chat({
        model,
        messages,
        thinking: false,
        maxTokens: LIMITS.maxAnswerTokens,
        temperature: 0.5,
        signal: ctrl.signal,
        onDelta: (delta) => {
          if (ctrl.signal.aborted) return;
          if (!streaming) {
            streaming = true;
            stage(requestId, 'streaming');
          }
          ctx.emit('ask:chunk', { requestId, delta }, 'overlay');
        },
      });
      if (ctrl.signal.aborted) return;

      const answer = res.content.trim() ? res.content : '_No answer was returned. Try asking again._';
      thread.push({ user: userContent, assistant: answer });
      if (thread.length > LIMITS.threadTurns * 2) thread = thread.slice(-LIMITS.threadTurns);
      const meta: AnswerMeta = {
        requestId,
        kind: job.kind,
        question: job.question,
        usedScreenshot: job.withScreenshot,
        ocrChars,
        model: res.model,
        sessionId,
        startedAt,
        finishedAt: Date.now(),
        usage: res.usage,
      };
      active = active?.requestId === requestId ? null : active;
      ctx.emit('ask:done', { requestId, answer, meta }, 'overlay');
      ctx.bus.emit('ai:exchange', {
        requestId,
        kind: job.kind,
        question: job.question,
        answer,
        usedScreenshot: job.withScreenshot,
        ocrChars,
        model: res.model,
        at: meta.finishedAt,
        sessionId,
      });
      log(`ask ${job.kind} done: model=${res.model} ${meta.finishedAt - startedAt} ms, screen=${job.withScreenshot} (${ocrChars} chars), transcript=${transcript ? transcript.length : 0} chars, thread=${thread.length}, tokens=${res.usage?.promptTokens}/${res.usage?.completionTokens}`);
    } catch (err) {
      if (ctrl.signal.aborted) return; // cancelActive already reported it
      const error = toErrorInfo(err);
      log(`ask ${job.kind} failed: ${error.code} ${error.message}`);
      if (active?.requestId === requestId) active = null;
      ctx.emit('ask:error', { requestId, error }, 'overlay');
    }
  }

  const screenshotDefault = (options: AskOptions | undefined, kind: AnswerMeta['kind']) =>
    options?.withScreenshot ?? (kind === 'ask' ? ctx.getSettings().attachScreenshotByDefault : true);

  function quickJob(kind: QuickActionKind, options: AskOptions = {}): AskJob {
    return { kind, question: QUICK_LABELS[kind], instruction: QUICK_PROMPTS[kind], options, withScreenshot: screenshotDefault(options, kind) };
  }

  ctx.handle('ask:ask', (req) => {
    const options = req?.options ?? {};
    const question = String(req?.question ?? '').trim();
    if (options.source === 'insight' && options.insightId) {
      const item: InsightAction = insights.getItem(options.insightId) ?? { id: options.insightId, kind: 'question', text: question };
      if (!item.text) throw new GlintError('BAD_REQUEST', 'Unknown insight item and no question text');
      return start({ kind: 'ask', question: item.text, instruction: insightPrompt(item), options, withScreenshot: screenshotDefault(options, 'ask') });
    }
    if (!question) return start(quickJob('assist', options)); // ⌘↵ with an empty box = Assist (F03)
    return start({ kind: 'ask', question, instruction: `QUESTION: ${question}`, options, withScreenshot: screenshotDefault(options, 'ask') });
  });

  ctx.handle('ask:quick', (req) => {
    if (!req || !QUICK_KINDS.includes(req.kind)) throw new GlintError('BAD_REQUEST', `Unknown quick action "${req?.kind}"`);
    return start(quickJob(req.kind, req.options));
  });

  ctx.handle('ask:cancel', (req) => {
    if (active && (!req?.requestId || active.requestId === req.requestId)) cancelActive('Cancelled');
  });

  ctx.handle('ask:clear', () => {
    cancelActive('Conversation cleared');
    thread = [];
    ctx.emit('ask:cleared', {});
  });

  // ----- Live insights from the Audio module's transcript -----
  ctx.bus.on('session:started', ({ sessionId, resumed }) => {
    insights.start(sessionId);
    if (!resumed) return;
    // The sessions module (registered after this one) loads the resumed transcript in its own
    // session:started listener, so seed the earlier segments on the next tick.
    setImmediate(() => {
      const live = getLiveSession();
      if (live?.id === sessionId) insights.seed([...live.segments]);
    });
  });
  ctx.bus.on('transcript:segment', (seg) => insights.add(seg));
  ctx.bus.on('session:stopped', ({ sessionId }) => insights.stop(sessionId));

  if (ctx.flags.test) {
    // GLINT_TEST only: lets a Playwright driver feed bus events (real pipeline, file-free input)
    // and read state from the main process via electronApp.evaluate().
    (globalThis as Record<string, unknown>).__glintAiTest = {
      busEmit: (event: string, payload: unknown) => (ctx.bus.emit as (e: string, p: unknown) => void)(event, payload),
      insights: () => insights.snapshot(),
      threadLength: () => thread.length,
      ocrScreen: async () => {
        const r = await ocr.captureAndRecognize(overlayCenter());
        return { permission: r.permission, engine: r.engine, chars: r.text.length, text: r.text, ms: r.ms, captureMs: r.captureMs, width: r.width, height: r.height };
      },
    };
  }
  log(`registered (key ${client.hasKey() ? 'available' : 'MISSING'})`);
}

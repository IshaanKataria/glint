// Sessions: persists live sessions to disk, writes the AI summary/title/action items when a
// session stops, and serves the history:* channels (FEATURES F50-F57).
import { GlintError, type ServiceContext } from '../main/context';
import type { SessionStatus, TranscriptSegment } from '../shared/contract';
import { DeepSeekClient } from '../ai/deepseek';
import { generateNotes } from './notes';
import { defaultTitle, SessionStore, transcriptText, type SessionFile } from './store';

interface Live {
  file: SessionFile;
  flushTimer?: NodeJS.Timeout;
}

let live: Live | null = null;

/** The session currently capturing audio (for the AI module's transcript context), or null. */
export function getLiveSession(): { id: string; segments: readonly TranscriptSegment[]; startedAt: number } | null {
  return live ? { id: live.file.id, segments: live.file.transcript, startedAt: live.file.startedAt } : null;
}

export function register(ctx: ServiceContext): void {
  const store = new SessionStore(ctx.dataDir);
  const ai = new DeepSeekClient(() => ctx.getDeepSeekKey(), (...a) => ctx.log('sessions', ...a));
  const pending = new Map<string, Promise<void>>();
  const log = (...a: unknown[]) => ctx.log('sessions', ...a);

  const status = (s: SessionStatus) => ctx.emit('session:status', s);
  const changed = (id: string) => ctx.emit('history:changed', { sessionId: id });

  const flushSoon = () => {
    if (!live || live.flushTimer) return;
    live.flushTimer = setTimeout(() => {
      if (!live) return;
      live.flushTimer = undefined;
      try {
        store.write(live.file);
      } catch (err) {
        log('flush failed:', (err as Error).message);
      }
    }, 1500);
  };

  const recomputeDuration = (f: SessionFile) => {
    f.durationMs = f.runs.reduce((sum, r) => sum + Math.max(0, (r.endedAt ?? Date.now()) - r.startedAt), 0);
    f.durationSec = Math.round(f.durationMs / 1000);
  };

  async function summarize(f: SessionFile): Promise<void> {
    if (!f.transcript.some((s) => s.text.trim())) {
      f.title = f.title === defaultTitle(f.startedAt) || !f.title ? 'Empty session' : f.title;
      f.summaryMarkdown = undefined;
      f.actionItems = [];
      f.summaryError = 'nothing was transcribed';
      f.status = 'summary_failed';
      return;
    }
    const model = ctx.getSettings().answerModel || 'deepseek-v4-pro';
    const n = await generateNotes(ai, {
      transcript: f.transcript,
      startedAt: f.startedAt,
      durationSec: f.durationSec,
      usage: f.usage,
      model,
      log: (...a) => log(`[${f.id}]`, ...a),
    });
    f.title = n.title || f.title;
    f.summaryMarkdown = n.summaryMarkdown || undefined;
    f.actionItems = n.actionItems;
    f.summaryModel = n.model;
    f.summaryError = undefined;
    f.status = f.summaryMarkdown ? 'saved' : 'summary_failed';
    if (!f.summaryMarkdown) f.summaryError = 'model returned no summary';
    if (n.issues.length) log(`summary for ${f.id} kept after ${n.attempts} attempts with issues: ${n.issues.join('; ')}`);
    log(`summary for ${f.id}: model=${n.model} ${n.ms} ms, ${n.attempts} attempt(s), ${n.sections.length} sections, title="${f.title}", ${f.actionItems.length} action items, tokens=${n.usage.promptTokens}/${n.usage.completionTokens}`);
  }

  async function finish(f: SessionFile): Promise<void> {
    status({ state: 'summarizing', sessionId: f.id, startedAt: f.startedAt, source: f.source, message: 'Writing notes...' });
    try {
      await summarize(f);
    } catch (err) {
      f.status = 'summary_failed';
      f.summaryError = (err as Error).message;
      log(`summary failed for ${f.id}: ${f.summaryError}`);
    }
    f.notesPath = store.writeNotes(f);
    store.write(f);
    changed(f.id);
    status({
      state: f.status === 'saved' ? 'saved' : 'error',
      sessionId: f.id,
      startedAt: f.startedAt,
      source: f.source,
      message: f.status === 'saved' ? `Saved "${f.title}"` : `Saved without summary: ${f.summaryError}`,
    });
  }

  function stopLive(endedAt: number): SessionFile | null {
    if (!live) return null;
    const f = live.file;
    clearTimeout(live.flushTimer);
    live = null;
    const run = f.runs[f.runs.length - 1];
    if (run && !run.endedAt) run.endedAt = endedAt;
    f.endedAt = endedAt;
    recomputeDuration(f);
    f.status = 'summarizing';
    store.write(f);
    changed(f.id);
    const p = finish(f).finally(() => pending.delete(f.id));
    pending.set(f.id, p);
    return f;
  }

  // ----- bus: Audio -> sessions -----
  ctx.bus.on('session:started', ({ sessionId, startedAt, resumed, source }) => {
    if (live && live.file.id !== sessionId) stopLive(Date.now());
    if (live && live.file.id === sessionId) return; // duplicate event
    const existing = store.read(sessionId);
    let f: SessionFile;
    if (existing && (resumed || existing.transcript.length)) {
      f = existing;
      f.runs = [...(f.runs ?? [{ startedAt: f.startedAt, endedAt: f.endedAt ?? f.startedAt + f.durationMs }]), { startedAt }];
      f.status = 'recording';
      f.endedAt = undefined;
      f.source = source ?? f.source;
      log(`resumed ${sessionId} (${f.transcript.length} segments so far)`);
    } else {
      f = {
        version: 1,
        id: sessionId,
        title: defaultTitle(startedAt),
        status: 'recording',
        startedAt,
        durationSec: 0,
        durationMs: 0,
        source,
        transcript: [],
        actionItems: [],
        usage: [],
        runs: [{ startedAt }],
      };
      log(`started ${sessionId} -> ${store.dir(sessionId)}`);
    }
    live = { file: f };
    store.write(f);
    changed(sessionId);
  });

  ctx.bus.on('transcript:segment', (seg) => {
    if (!live || seg.sessionId !== live.file.id) {
      log(`segment for ${seg.sessionId} ignored (live: ${live?.file.id ?? 'none'})`);
      return;
    }
    const t = live.file.transcript;
    const i = t.findIndex((s) => s.id === seg.id);
    if (i >= 0) t[i] = seg; // revised segment
    else t.push(seg);
    try {
      store.appendSegment(seg.sessionId, seg);
    } catch (err) {
      log('append failed:', (err as Error).message);
    }
    recomputeDuration(live.file);
    flushSoon();
  });

  ctx.bus.on('session:stopped', ({ sessionId, endedAt }) => {
    if (!live || live.file.id !== sessionId) {
      log(`stop for ${sessionId} ignored (live: ${live?.file.id ?? 'none'})`);
      return;
    }
    stopLive(endedAt);
  });

  ctx.bus.on('ai:exchange', ({ sessionId, ...entry }) => {
    if (!sessionId) return;
    if (live && live.file.id === sessionId) {
      live.file.usage.push(entry);
      flushSoon();
      return;
    }
    const f = store.read(sessionId);
    if (!f) return;
    f.usage.push(entry);
    store.write(f);
    if (f.notesPath) store.writeNotes(f);
    changed(sessionId);
  });

  // ----- history:* -----
  const load = (id: string): SessionFile => {
    if (live && live.file.id === id) return live.file;
    let f: SessionFile | null;
    try {
      f = store.read(id);
    } catch (err) {
      throw new GlintError('BAD_REQUEST', (err as Error).message);
    }
    if (!f) throw new GlintError('NOT_FOUND', `No saved session "${id}"`);
    return f;
  };

  ctx.handle('history:list', () =>
    store
      .all()
      .map((f) => (live && live.file.id === f.id ? live.file : f))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(SessionStore.toListItem),
  );

  ctx.handle('history:get', (req) => {
    if (!req?.id) throw new GlintError('BAD_REQUEST', 'history:get needs { id }');
    return SessionStore.toRecord(load(req.id));
  });

  ctx.handle('history:resume', async (req) => {
    if (!req?.id) throw new GlintError('BAD_REQUEST', 'history:resume needs { id }');
    load(req.id); // NOT_FOUND early
    if (pending.has(req.id)) await pending.get(req.id);
    const r = await ctx.call('session:start', { resumeSessionId: req.id });
    if (!r.ok) throw new GlintError(r.error.code, r.error.message);
    return r.value;
  });

  const copy = async (text: string) => {
    const r = await ctx.call('app:copyText', { text });
    if (!r.ok) throw new GlintError(r.error.code, r.error.message);
    return r.value;
  };

  ctx.handle('history:copyTranscript', (req) => {
    if (!req?.id) throw new GlintError('BAD_REQUEST', 'history:copyTranscript needs { id }');
    const f = load(req.id);
    return copy(transcriptText(f.transcript));
  });

  ctx.handle('history:copySummary', (req) => {
    if (!req?.id) throw new GlintError('BAD_REQUEST', 'history:copySummary needs { id }');
    const f = load(req.id);
    if (!f.summaryMarkdown) throw new GlintError('NOT_FOUND', 'This session has no summary yet');
    const actions = f.actionItems.length ? `\n\n**Action items**\n${f.actionItems.map((a) => `- ${a}`).join('\n')}` : '';
    return copy(`# ${f.title}\n\n${f.summaryMarkdown}${actions}`);
  });

  if (ctx.flags.test) {
    const g = globalThis as Record<string, unknown>;
    g.__glintSessionsTest = {
      /** Resolves when every pending summary is written. */
      idle: () => Promise.all([...pending.values()]),
      live: () => (live ? { id: live.file.id, segments: live.file.transcript.length } : null),
    };
  }
  log(`registered (dataDir=${ctx.dataDir})`);
}

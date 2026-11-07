import { ipcMain, type IpcMainInvokeEvent, type BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import type {
  BusEvent,
  BusMap,
  ErrorCode,
  EventChannel,
  EventMap,
  InvokeChannel,
  Req,
  Res,
  Result,
  Settings,
  WindowKind,
} from '../shared/contract';
import { envWithoutSecrets, getDeepSeekKey } from './secrets';

/** Throw this from a handler to return a typed error to the renderer. */
export class GlintError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GlintError';
  }
}

export const notImplemented = (what: string) =>
  new GlintError('NOT_IMPLEMENTED', `${what} is not implemented yet`);

export type Handler<C extends InvokeChannel> = (
  req: Req<C>,
  event: IpcMainInvokeEvent | null,
) => Res<C> | Promise<Res<C>>;

export interface TypedBus {
  on<E extends BusEvent>(event: E, fn: (payload: BusMap[E]) => void): () => void;
  emit<E extends BusEvent>(event: E, payload: BusMap[E]): void;
}

export interface TestFlags {
  /** GLINT_TEST=1: test introspection channels are live. */
  test: boolean;
  /** GLINT_AUDIO_FILE: session audio source instead of the mic. */
  audioFile?: string;
}

/** What every service module's register(ctx) receives. */
export interface ServiceContext {
  /** Register an invoke handler. Return the value or throw (GlintError for a typed code). */
  handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void;
  /** Call a registered handler in-process (e.g. sessions calling session:start for resume). */
  call<C extends InvokeChannel>(channel: C, req: Req<C>): Promise<Result<Res<C>>>;
  /** Send an event to the overlay, the dashboard, or both ('all', default). */
  emit<E extends EventChannel>(channel: E, payload: EventMap[E], target?: WindowKind | 'all'): void;
  /** In-process service bus (never crosses IPC). */
  bus: TypedBus;
  /** Sessions directory: GLINT_DATA_DIR or <userData>/sessions. Exists. */
  dataDir: string;
  /** Project root (repo checkout), for scripts/ and native/ helpers. */
  projectRoot: string;
  /** DeepSeek key from env or fish, in memory only. Never log it. Undefined if unavailable. */
  getDeepSeekKey(): string | undefined;
  /** process.env without secrets, for child processes. */
  childEnv(): NodeJS.ProcessEnv;
  flags: TestFlags;
  getSettings(): Settings;
  getWindow(kind: WindowKind): BrowserWindow | null;
  log(scope: string, ...args: unknown[]): void;
}

export function toErrorInfo(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof GlintError) return { code: err.code, message: err.message };
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
}

export function log(scope: string, ...args: unknown[]): void {
  console.log(`[glint:${scope}]`, ...args);
}

interface ContextDeps {
  dataDir: string;
  projectRoot: string;
  flags: TestFlags;
  getSettings(): Settings;
  getWindow(kind: WindowKind): BrowserWindow | null;
}

export function createContext(deps: ContextDeps): ServiceContext & { registered: Set<string> } {
  const handlers = new Map<string, Handler<InvokeChannel>>();
  const registered = new Set<string>();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  async function run<C extends InvokeChannel>(
    channel: C,
    req: Req<C>,
    event: IpcMainInvokeEvent | null,
  ): Promise<Result<Res<C>>> {
    const h = handlers.get(channel) as Handler<C> | undefined;
    if (!h) return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `${channel} has no handler` } };
    try {
      return { ok: true, value: await h(req, event) };
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'INTERNAL') log('ipc', `${channel} failed:`, info.message);
      return { ok: false, error: info };
    }
  }

  const ctx: ServiceContext & { registered: Set<string> } = {
    registered,
    handle(channel, handler) {
      if (handlers.has(channel)) {
        ipcMain.removeHandler(channel);
        log('ipc', `handler for ${channel} replaced`);
      }
      handlers.set(channel, handler as unknown as Handler<InvokeChannel>);
      registered.add(channel);
      ipcMain.handle(channel, (event, req) => run(channel, req, event));
    },
    call(channel, req) {
      return run(channel, req, null);
    },
    emit(channel, payload, target = 'all') {
      const kinds: WindowKind[] = target === 'all' ? ['overlay', 'dashboard'] : [target];
      for (const k of kinds) {
        const w = deps.getWindow(k);
        if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(channel, payload);
      }
    },
    bus: {
      on(event, fn) {
        emitter.on(event, fn as (p: unknown) => void);
        return () => emitter.off(event, fn as (p: unknown) => void);
      },
      emit(event, payload) {
        emitter.emit(event, payload);
      },
    },
    dataDir: deps.dataDir,
    projectRoot: deps.projectRoot,
    getDeepSeekKey,
    childEnv: envWithoutSecrets,
    flags: deps.flags,
    getSettings: deps.getSettings,
    getWindow: deps.getWindow,
    log,
  };
  return ctx;
}

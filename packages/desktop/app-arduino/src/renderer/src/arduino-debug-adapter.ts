import type {
  IDebugAdapter,
  IDebugBreakpoint,
  IDebugStartParams,
  TDebugEvent,
  TDebugEventListener,
  TDebugResumeMode,
} from '@falang/debug';
import type { IProjectDocument } from '@falang/dto';

/** `IDebugStartParams.entry` for the Arduino product — unlike the workflow product (a function name + args to run), an Arduino sketch has nothing to select: "Debug" always means "build the current project with tracing on, upload it, and attach" against a chosen board/port. */
export interface IArduinoDebugEntry {
  readonly fqbn: string;
  readonly port: string;
}

export interface IArduinoDebugAdapterHooks {
  readonly getProjectDir: () => string;
  readonly getDocuments: () => readonly IProjectDocument[];
}

/**
 * The Arduino product's `IDebugAdapter` (ADR 0021 (private) §6) — a thin IPC shim over `main`'s
 * `buildAndUploadDebugSketch`/`SerialDebugSession`. Unlike the workflow product's polling
 * `TemporalDebugAdapter`, events are pushed: `main` forwards every `TDebugEvent` it gets from the
 * firmware straight over `IPC.debugEvent` (`webContents.send`), and this class just fans it out to
 * `DebugSessionStore`'s single listener.
 */
export class ArduinoDebugAdapter implements IDebugAdapter {
  private readonly hooks: IArduinoDebugAdapterHooks;
  private readonly listeners = new Set<TDebugEventListener>();
  private unsubscribeIpc: (() => void) | null = null;

  constructor(hooks: IArduinoDebugAdapterHooks) {
    this.hooks = hooks;
  }

  subscribe(listener: TDebugEventListener): () => void {
    this.listeners.add(listener);
    this.unsubscribeIpc ??= globalThis.falang.debug.onEvent((event) => this.emit(event));
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(params: IDebugStartParams): Promise<void> {
    const entry = params.entry as IArduinoDebugEntry | undefined;
    if (!entry) throw new Error('ArduinoDebugAdapter.start requires an entry ({ fqbn, port })');

    const outcome = await globalThis.falang.arduino.uploadDebug(
      this.hooks.getProjectDir(),
      [...this.hooks.getDocuments()],
      entry.fqbn,
      entry.port,
    );
    if (outcome.stage === 'compile-error') {
      this.emit({ type: 'terminated', reason: 'failed', message: outcome.message });
      return;
    }
    if (!outcome.result.ok) {
      this.emit({ type: 'terminated', reason: 'failed', message: outcome.result.output });
      return;
    }

    await globalThis.falang.debug.start({
      port: entry.port,
      debugMap: outcome.debugMap,
      breakpoints: [...params.breakpoints],
      pauseOnEntry: params.pauseOnEntry,
    });
  }

  setBreakpoints(breakpoints: readonly IDebugBreakpoint[]): Promise<void> {
    return globalThis.falang.debug.setBreakpoints([...breakpoints]);
  }

  resume(mode: TDebugResumeMode): Promise<void> {
    return globalThis.falang.debug.resume(mode);
  }

  stop(): Promise<void> {
    return globalThis.falang.debug.stop();
  }

  private emit(event: TDebugEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

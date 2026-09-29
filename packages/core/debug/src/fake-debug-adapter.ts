import {
  debugLocationKey,
  type IDebugAdapter,
  type IDebugBreakpoint,
  type IDebugLocation,
  type IDebugStartParams,
  type IDebugVariable,
  type TDebugEvent,
  type TDebugEventListener,
  type TDebugPauseReason,
  type TDebugResumeMode,
} from './protocol.js';

/** One statement the fake "program" will visit, in order. */
export interface IFakeDebugStep {
  readonly location: IDebugLocation;
  readonly variables?: readonly IDebugVariable[];
  readonly functionName?: string;
}

export interface IFakeDebugAdapterParams {
  /** Read once per `start()`, so a host can compute the walk from the live diagram. */
  readonly getSteps: () => readonly IFakeDebugStep[];
  /** Delay between two consecutive steps while running (not paused). */
  readonly stepDelayMs?: number;
}

const DEFAULT_STEP_DELAY_MS = 300;

/**
 * An `IDebugAdapter` with no runtime behind it: walks `getSteps()` on a timer, honoring
 * breakpoints, `pauseOnEntry`, continue/step-over and stop. Exists so the shared debugger UI
 * (`@falang/scheme`'s `DebuggerModule`, `@falang/antd`'s panel) can be built, unit-tested and
 * eyeballed in `playground` before any real transport exists — ADR 0021's Phase 0. The whole walk is
 * one flat frame, so step-over and "next step" coincide here.
 */
export class FakeDebugAdapter implements IDebugAdapter {
  private readonly listeners = new Set<TDebugEventListener>();
  private readonly breakpointKeys = new Set<string>();
  private readonly getSteps: () => readonly IFakeDebugStep[];
  private readonly stepDelayMs: number;
  private steps: readonly IFakeDebugStep[] = [];
  private position = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepping = false;
  private active = false;

  constructor(params: IFakeDebugAdapterParams) {
    this.getSteps = params.getSteps;
    this.stepDelayMs = params.stepDelayMs ?? DEFAULT_STEP_DELAY_MS;
  }

  subscribe(listener: TDebugEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(params: IDebugStartParams): Promise<void> {
    this.clearTimer();
    this.steps = this.getSteps();
    this.position = -1;
    this.stepping = false;
    this.active = true;
    this.replaceBreakpoints(params.breakpoints);
    this.emit({ type: 'started' });
    if (params.pauseOnEntry && this.steps.length > 0) {
      this.position = 0;
      this.pauseHere('entry');
    } else {
      this.scheduleNext();
    }
    return Promise.resolve();
  }

  setBreakpoints(breakpoints: readonly IDebugBreakpoint[]): Promise<void> {
    this.replaceBreakpoints(breakpoints);
    return Promise.resolve();
  }

  resume(mode: TDebugResumeMode): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.stepping = mode === 'step-over';
    this.emit({ type: 'resumed' });
    this.scheduleNext();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.clearTimer();
    this.active = false;
    this.emit({ type: 'terminated', reason: 'stopped' });
    return Promise.resolve();
  }

  private replaceBreakpoints(breakpoints: readonly IDebugBreakpoint[]): void {
    this.breakpointKeys.clear();
    for (const breakpoint of breakpoints) this.breakpointKeys.add(debugLocationKey(breakpoint));
  }

  private scheduleNext(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.advance();
    }, this.stepDelayMs);
  }

  private advance(): void {
    if (!this.active) return;
    this.position += 1;
    if (this.position >= this.steps.length) {
      this.active = false;
      this.emit({ type: 'terminated', reason: 'completed' });
      return;
    }
    const step = this.steps[this.position];
    if (this.breakpointKeys.has(debugLocationKey(step.location))) {
      this.pauseHere('breakpoint');
      return;
    }
    if (this.stepping) {
      this.pauseHere('step');
      return;
    }
    this.scheduleNext();
  }

  private pauseHere(reason: TDebugPauseReason): void {
    const step = this.steps[this.position];
    this.stepping = false;
    this.emit({
      type: 'paused',
      location: step.location,
      variables: step.variables ?? [],
      stack: [{ location: step.location, functionName: step.functionName ?? 'main' }],
      reason,
    });
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(event: TDebugEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

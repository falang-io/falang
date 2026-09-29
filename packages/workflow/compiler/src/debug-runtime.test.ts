import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DEBUG_RUNTIME_CODE } from './debug-runtime.js';

/** Strips types the same way `tsx` would at runtime (transpile-only, no type-check) — `new Function` can't parse TS syntax directly. */
const transpile = (code: string): string =>
  ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } })
    .outputText;

interface IDebugRuntime {
  trace(index: number, snapshot: () => Record<string, unknown>): Promise<void>;
  enter(): void;
  leave(): void;
}

interface IQueryState {
  readonly status: 'running' | 'paused';
  readonly tracePoint: number | null;
  readonly depth: number;
  readonly variables: Record<string, unknown>;
  readonly reason: 'breakpoint' | 'step' | 'entry' | null;
}

interface IConfigurePayload {
  breakpoints: number[];
  pauseOnEntry: boolean;
}
interface IResumePayload {
  mode: 'continue' | 'step-over';
}

/** Hoisted out of `buildRuntimeHarness` — it captures nothing from that scope. */
const defineQuery = (): { kind: 'query' } => ({ kind: 'query' });

/**
 * Evaluates `DEBUG_RUNTIME_CODE` (plain TS emitted as a string into the compiled workflow module,
 * see `debug-runtime.ts`) against fake `@temporalio/workflow` primitives, so the runtime's own
 * pause/resume/step/entry state machine can be unit-tested without a real Temporal Worker (that's
 * covered by the workflow-tier e2e spec instead). `setHandler`'s buffered-then-flushed-on-register
 * semantics for a `signalWithStart`-delivered signal are simulated by `sendConfigureWithStart` —
 * this mirrors the same pattern `compile-trigger-function.ts`'s already-shipped signal-wait already
 * relies on (register the handler synchronously, before any `await`, so a signal sent with start is
 * already applied by the time the next line reads the state it set).
 */
const buildRuntimeHarness = (): {
  readonly debug: IDebugRuntime;
  sendConfigureWithStart(payload: IConfigurePayload): void;
  configure(payload: IConfigurePayload): void;
  resume(payload: IResumePayload): void;
  state(): IQueryState;
} => {
  let configureHandler: ((payload: IConfigurePayload) => void) | null = null;
  let resumeHandler: ((payload: IResumePayload) => void) | null = null;
  let queryHandler: (() => IQueryState) | null = null;
  let bufferedConfigure: IConfigurePayload | null = null;
  const pending: { predicate: () => boolean; resolve: () => void }[] = [];

  // Two `defineSignal()` calls happen in a fixed order inside `DEBUG_RUNTIME_CODE` (configure, then
  // resume) — tracked positionally rather than by name, since these fakes don't carry the signal's
  // name through (only the real `@temporalio/workflow` needs to route by name).
  let signalDefCount = 0;
  const CONFIGURE_KIND = 'configure';
  const RESUME_KIND = 'resume';
  const defineSignal = (): { kind: string } => {
    signalDefCount += 1;
    return { kind: signalDefCount === 1 ? CONFIGURE_KIND : RESUME_KIND };
  };
  const setHandler = (def: { kind: string }, handler: (...args: unknown[]) => unknown): void => {
    if (def.kind === CONFIGURE_KIND) {
      configureHandler = handler as (payload: IConfigurePayload) => void;
      if (bufferedConfigure) {
        configureHandler(bufferedConfigure);
        bufferedConfigure = null;
      }
    } else if (def.kind === RESUME_KIND) {
      resumeHandler = handler as (payload: IResumePayload) => void;
    } else {
      queryHandler = handler as () => IQueryState;
    }
  };
  const pump = (): void => {
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (pending[i].predicate()) {
        const { resolve } = pending[i];
        pending.splice(i, 1);
        resolve();
      }
    }
  };
  const condition = (predicate: () => boolean): Promise<void> =>
    new Promise((resolve) => {
      if (predicate()) {
        resolve();
        return;
      }
      pending.push({ predicate, resolve });
    });

  // eslint-disable-next-line no-new-func -- evaluating compiler-emitted source is the point of this test.
  const factory = new Function(
    'condition',
    'defineSignal',
    'defineQuery',
    'setHandler',
    `${transpile(DEBUG_RUNTIME_CODE)}\nreturn __falangDebug;`,
  ) as (
    conditionFn: typeof condition,
    defineSignalFn: typeof defineSignal,
    defineQueryFn: typeof defineQuery,
    setHandlerFn: typeof setHandler,
  ) => IDebugRuntime;
  const debug = factory(condition, defineSignal, defineQuery, setHandler);

  return {
    debug,
    sendConfigureWithStart: (payload) => {
      bufferedConfigure = payload;
    },
    configure: (payload) => configureHandler?.(payload),
    resume: (payload) => {
      resumeHandler?.(payload);
      pump();
    },
    state: () => {
      if (!queryHandler) throw new Error('query handler not registered yet — call debug.enter() first');
      return queryHandler();
    },
  };
};

describe('DEBUG_RUNTIME_CODE', () => {
  it('trace() is a no-op (resolves immediately, stays "running") with no breakpoints/step/entry pending', async () => {
    const { debug, state } = buildRuntimeHarness();
    debug.enter();
    await debug.trace(0, () => ({ a: 1 }));
    expect(state().status).toBe('running');
    debug.leave();
  });

  it('pauses on a configured breakpoint, snapshots the scope, and resumes on "continue"', async () => {
    const { debug, configure, resume, state } = buildRuntimeHarness();
    debug.enter();
    configure({ breakpoints: [5], pauseOnEntry: false });

    let resolved = false;
    const paused = debug
      .trace(5, () => ({ x: 42 }))
      .then(() => {
        resolved = true;
      });
    expect(state()).toEqual({ status: 'paused', tracePoint: 5, depth: 1, variables: { x: 42 }, reason: 'breakpoint' });
    expect(resolved).toBe(false);

    resume({ mode: 'continue' });
    await paused;
    expect(resolved).toBe(true);
    expect(state().status).toBe('running');
    debug.leave();
  });

  it('"pause on entry" fires once, only at the outermost enter(), consuming a signal sent with start', async () => {
    const { debug, sendConfigureWithStart, resume, state } = buildRuntimeHarness();
    sendConfigureWithStart({ breakpoints: [], pauseOnEntry: true });
    debug.enter();

    const paused = debug.trace(0, () => ({}));
    expect(state().reason).toBe('entry');
    resume({ mode: 'continue' });
    await paused;

    // A nested call's own enter() must not re-arm entry-pause.
    debug.enter();
    let secondResolved = false;
    await debug
      .trace(1, () => ({}))
      .then(() => {
        secondResolved = true;
      });
    expect(secondResolved).toBe(true);
    debug.leave();
    debug.leave();
  });

  it('"step over" stops at the next trace point whose depth is ≤ the depth when resumed, skipping deeper nested calls', async () => {
    const { debug, configure, resume, state } = buildRuntimeHarness();
    // depth 1
    debug.enter();
    configure({ breakpoints: [0], pauseOnEntry: false });

    const first = debug.trace(0, () => ({}));
    expect(state().status).toBe('paused');
    // Arms a stop at depth ≤ 1.
    resume({ mode: 'step-over' });
    await first;

    // A nested call-function — depth 2.
    debug.enter();
    let nestedResolved = false;
    await debug
      .trace(1, () => ({}))
      .then(() => {
        nestedResolved = true;
      });
    // Deeper than the armed step depth — must not pause.
    expect(nestedResolved).toBe(true);
    expect(state().status).toBe('running');
    // Back to depth 1.
    debug.leave();

    let thirdResolved = false;
    const third = debug
      .trace(2, () => ({}))
      .then(() => {
        thirdResolved = true;
      });
    expect(state()).toMatchObject({ status: 'paused', tracePoint: 2, depth: 1, reason: 'step' });
    expect(thirdResolved).toBe(false);
    resume({ mode: 'continue' });
    await third;
    debug.leave();
  });

  it('setBreakpoints-equivalent (a second configure signal) replaces the live breakpoint set', async () => {
    const { debug, configure, resume } = buildRuntimeHarness();
    debug.enter();
    configure({ breakpoints: [1], pauseOnEntry: false });
    // Not a breakpoint — resolves immediately.
    await debug.trace(2, () => ({}));

    configure({ breakpoints: [2], pauseOnEntry: false });
    const paused = debug.trace(2, () => ({}));
    resume({ mode: 'continue' });
    // Would hang forever if the second configure hadn't replaced the first set.
    await paused;
    debug.leave();
  });

  it('truncates values deeper than 8 levels and larger than 32KB in the snapshot', async () => {
    const { debug, configure, resume, state } = buildRuntimeHarness();
    debug.enter();
    configure({ breakpoints: [0], pauseOnEntry: false });

    let deep: unknown = 'leaf';
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    const huge = 'x'.repeat(40 * 1024);

    const paused = debug.trace(0, () => ({ deep, huge, ok: 'fine' }));
    const { variables } = state();
    expect(variables.ok).toBe('fine');
    expect(variables.huge).toBe('[Truncated: too large]');
    // 8 levels of `{ nested: ... }` deep, then the truncation marker string.
    let cursor = variables.deep as { nested?: unknown };
    for (let i = 0; i < 8; i += 1) cursor = cursor.nested as { nested?: unknown };
    expect(cursor).toBe('[Truncated: max depth]');

    resume({ mode: 'continue' });
    await paused;
    debug.leave();
  });
});

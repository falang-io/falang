import type { IProjectDocument } from '@falang/dto';
import type { IDebugMap } from '@falang/debug';
import type { IDriverConfig } from './driver-config.js';

/**
 * The job payload sent to the sketch-compile worker process (`main/compile-worker/worker-main.ts`) —
 * `compileArduinoProject`'s own params, moved off the main process for the same reason
 * ADR 0019 (private)'s export worker exists: it's synchronous CPU-bound work (a real `ts.Program`
 * via `@falang/logic-constructor`) that would otherwise freeze every window's IPC for however long the
 * compile takes. Shared between `main` (constructs it) and the worker entry point (consumes it) —
 * plain types only, no runtime dependency either way.
 */
export interface ICompileWorkerJob {
  readonly documents: IProjectDocument[];
  readonly drivers: IDriverConfig[];
  readonly debug?: boolean;
}

/**
 * Mirrors `ICompileArduinoProjectResult`, except `usedDriverIds` is a plain array, not a `Set` — a
 * `Set` doesn't survive `child_process`'s JSON-based IPC serialization (`JSON.stringify` on one gives
 * `{}`). `run-compile-job.ts` rebuilds the `Set` on the way back out.
 */
export type TCompileWorkerResult =
  | {
      readonly ok: true;
      readonly code: string;
      readonly usedDriverIds: string[];
      readonly debugHeader?: string;
      readonly debugMap?: IDebugMap;
    }
  | { readonly ok: false; readonly message: string };

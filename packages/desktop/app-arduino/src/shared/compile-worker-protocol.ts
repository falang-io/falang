import type { IProjectDocument } from '@falang/dto';
import type { IDebugMap } from '@falang/debug';
import type { IDriverConfig } from './driver-config.js';
import type {
  IDriverValidationProject,
  IDriverValidationResult,
} from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';

/**
 * The job payload sent to the sketch-compile worker process (`main/compile-worker/worker-main.ts`) —
 * `compileArduinoProject`'s own params, moved off the main process for the same reason
 * ADR 0019 (private)'s export worker exists: it's synchronous CPU-bound work (a real `ts.Program`
 * via `@falang/logic-constructor`) that would otherwise freeze every window's IPC for however long the
 * compile takes. Shared between `main` (constructs it) and the worker entry point (consumes it) —
 * plain types only, no runtime dependency either way.
 */
export interface ICompileWorkerJob {
  readonly kind?: 'compile';
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

/**
 * ADR 0054 (private): validating a driver bundle (`validateDriverBundle` — stages 1–3 and 5) runs the same
 * synchronous TypeScript Compiler API work as a sketch compile, so it goes through the same worker
 * process. One job carries a batch (the registry validates every custom driver on a reload); an item with
 * `captureSketch` also returns the synthetic sketch the CLI stage would compile, so `main` can run (and
 * memoize) the `arduino-cli` check itself — a worker process is disposable and could not keep a cache.
 */
export interface IValidateDriversWorkerItem {
  readonly bundle: unknown;
  readonly ctx: {
    readonly otherDrivers: readonly (IDriverConfig & { readonly scope?: 'bundled' | 'library' | 'project' })[];
    readonly project?: IDriverValidationProject;
  };
  readonly captureSketch?: boolean;
}

export interface IValidateDriversWorkerJob {
  readonly kind: 'validate-drivers';
  readonly items: readonly IValidateDriversWorkerItem[];
}

export interface IValidateDriversWorkerResult {
  readonly kind: 'validate-drivers';
  readonly results: readonly {
    readonly result: IDriverValidationResult;
    readonly sketchFiles?: Readonly<Record<string, string>>;
  }[];
}

export type TWorkerJob = ICompileWorkerJob | IValidateDriversWorkerJob;
export type TWorkerResult = TCompileWorkerResult | IValidateDriversWorkerResult;

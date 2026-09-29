import type { IProjectDocument } from '@falang/dto';
import type { ILogicExportConfigurationItem } from '@falang/logic-dto';
import type { ILogicExportResult } from '@falang/logic-export';
import type { ICodeExportResult } from '@falang/simple-code-export';

/**
 * The job payload sent to the export worker process (`main/export-worker/worker-main.ts`) — one of
 * `IPC.logicExportRun`/`IPC.codeExportRun`'s two codegen paths, moved off the main process so a large
 * project's `ts.Program`-based compile (see ADR 0019 (private)) can't freeze the whole app. Shared
 * between `main` (constructs it) and the worker entry point (consumes it) — plain types only, no
 * runtime dependency either way.
 */
export type TExportWorkerJob =
  | {
      readonly kind: 'logic';
      readonly dir: string;
      readonly documents: IProjectDocument[];
      readonly exports: ILogicExportConfigurationItem[];
    }
  | { readonly kind: 'code'; readonly dir: string; readonly documents: IProjectDocument[] };

export type TExportWorkerResult =
  | { readonly kind: 'logic'; readonly result: ILogicExportResult }
  | { readonly kind: 'code'; readonly result: ICodeExportResult };

/** Normalized across both export kinds (`ILogicExportProgress`/`ICodeExportProgress` each have their
 * own shape) so the renderer's progress UI doesn't need to know which one is running. */
export interface IExportWorkerProgress {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

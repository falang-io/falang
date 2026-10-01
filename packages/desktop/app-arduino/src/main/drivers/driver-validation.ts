import type {
  IDriverCliCheckResult,
  IDriverValidationResult,
} from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';
import type { IDriverBundle } from '../../shared/driver-ipc-types.js';
import type { TDriverEditScope } from '../../shared/driver-ipc-types.js';
import type { IValidateDriversWorkerItem, IValidateDriversWorkerResult } from '../../shared/compile-worker-protocol.js';
import type { IDriverCheckItem, TDriverBatchValidator } from './project-driver-registry.js';

type TRunWorker = (items: readonly IValidateDriversWorkerItem[]) => Promise<IValidateDriversWorkerResult['results']>;

/** The registry's validator: stages 1–3 and 5 in the worker, no `arduino-cli`. */
export const createBatchValidator =
  (runWorker: TRunWorker): TDriverBatchValidator =>
  async (items: readonly IDriverCheckItem[]) => {
    const outcomes = await runWorker(items.map((item) => ({ bundle: item.bundle, ctx: item.ctx })));
    return outcomes.map((entry) => entry.result);
  };

/** Appends the stage-4 outcome to a result the worker produced without it — the same merge `validateDriverBundle` does itself. */
export const mergeCliResult = (
  result: IDriverValidationResult,
  cli: IDriverCliCheckResult,
): IDriverValidationResult => {
  const warnings = [...result.warnings, ...(cli.warnings ?? []).map((message) => ({ stage: 'cli' as const, message }))];
  const errors = (cli.errors ?? []).map((message) => ({ stage: 'cli' as const, message }));
  return { ok: errors.length === 0, errors, warnings };
};

export interface IFullValidatorDeps {
  readonly runWorker: TRunWorker;
  readonly otherDriversFor: (scope: TDriverEditScope) => IDriverCheckItem['ctx']['otherDrivers'];
  readonly readProjectContext: (projectDir: string) => Promise<IDriverCheckItem['ctx']['project']>;
  readonly getProjectDir: () => string | null;
  /** The board `scope` is checked for: the project's own for project scope, the default one for the library. */
  readonly getFqbn: (scope: TDriverEditScope, projectDir: string | null) => Promise<string>;
  readonly cliCheckFor: (fqbn: string) => (files: Readonly<Record<string, string>>) => Promise<IDriverCliCheckResult>;
}

/** The full pipeline a Save/Validate does: worker stages, then (when those pass) the memoized `arduino-cli` compile in `main`. */
export const createFullValidator =
  (deps: IFullValidatorDeps) =>
  async (bundle: IDriverBundle | unknown, scope: TDriverEditScope): Promise<IDriverValidationResult> => {
    const projectDir = deps.getProjectDir();
    if (scope === 'project' && !projectDir) {
      return { ok: false, errors: [{ stage: 'schema', message: 'No project is open' }], warnings: [] };
    }
    const projectCtx = scope === 'project' && projectDir ? { project: await deps.readProjectContext(projectDir) } : {};
    const outcomes = await deps.runWorker([
      {
        bundle,
        ctx: { otherDrivers: deps.otherDriversFor(scope), ...projectCtx },
        captureSketch: true,
      },
    ]);
    const outcome = outcomes[0];
    if (!outcome.result.ok || !outcome.sketchFiles) return outcome.result;
    const fqbn = await deps.getFqbn(scope, projectDir);
    return mergeCliResult(outcome.result, await deps.cliCheckFor(fqbn)(outcome.sketchFiles));
  };

import { createArduinoCliDriverCheck } from '@falang/desktop-arduino-compiler';
import type { IDriverCliCheckResult } from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';
import { DEFAULT_BOARD_FQBN } from '../../shared/board.js';
import { readArduinoProjectConfig } from '../arduino-project-config.js';
import { runValidateDriversJob } from '../compile-worker/run-compile-job.js';
import { markOwnDriversWrite } from '../project-watcher-state.js';
import { createBatchValidator, createFullValidator } from './driver-validation.js';
import { createDriverService, type TDriverService } from './driver-service.js';
import { watchDriverLibrary, type ILibraryWatcher } from './library-watcher.js';
import { ProjectDriverRegistry } from './project-driver-registry.js';
import { readDriverProjectContext } from './project-context.js';
import type { IDriverListPayload } from '../../shared/driver-ipc-types.js';

// oxlint-disable-next-line no-empty-function
const noop = (): void => {};

export interface IDriverRuntime {
  readonly registry: ProjectDriverRegistry;
  readonly service: TDriverService;
  /** Loads bundled + library drivers and starts watching the library. Call once, before the renderer asks for `drivers:list`. */
  start: () => Promise<void>;
  stop: () => void;
}

export interface IDriverRuntimeParams {
  readonly bundledDir: string;
  readonly libraryDir: string;
  /** Called with the new list after every reload (→ the `drivers:changed` event). */
  readonly onChanged: (payload: IDriverListPayload) => void;
}

/** The Electron-side composition of the driver registry, validator and service (ADR 0054 (private) §3). */
export const createDriverRuntime = ({ bundledDir, libraryDir, onChanged }: IDriverRuntimeParams): IDriverRuntime => {
  const runWorker = async (items: Parameters<typeof runValidateDriversJob>[0]['items']) => {
    const outcome = await runValidateDriversJob({ items });
    return outcome.results;
  };
  const registry = new ProjectDriverRegistry({
    bundledDir,
    libraryDir,
    validate: createBatchValidator(runWorker),
    readProjectContext: readDriverProjectContext,
  });
  const checks = new Map<string, (files: Readonly<Record<string, string>>) => Promise<IDriverCliCheckResult>>();
  const cliCheckFor = (fqbn: string) => {
    let check = checks.get(fqbn);
    if (!check) {
      check = createArduinoCliDriverCheck({ fqbn });
      checks.set(fqbn, check);
    }
    return check;
  };
  let libraryWatcher: ILibraryWatcher | null = null;

  const service = createDriverService({
    registry,
    bundledDir,
    libraryDir,
    readProjectContext: readDriverProjectContext,
    validate: createFullValidator({
      runWorker,
      otherDriversFor: (scope) => registry.otherDriversFor(scope),
      readProjectContext: readDriverProjectContext,
      getProjectDir: () => registry.getProjectDir(),
      getFqbn: async (scope, projectDir) => {
        if (scope !== 'project' || !projectDir) return DEFAULT_BOARD_FQBN;
        const config = await readArduinoProjectConfig(projectDir).catch(() => null);
        return config?.board ?? DEFAULT_BOARD_FQBN;
      },
      cliCheckFor,
    }),
    markOwnProjectWrite: markOwnDriversWrite,
    markOwnLibraryWrite: () => libraryWatcher?.markOwnWrite(),
  });
  registry.onChange(onChanged);

  return {
    registry,
    service,
    start: async () => {
      libraryWatcher = await watchDriverLibrary(libraryDir, () => {
        registry.reload().catch(noop);
      });
      await registry.reload();
    },
    stop: () => libraryWatcher?.stop(),
  };
};

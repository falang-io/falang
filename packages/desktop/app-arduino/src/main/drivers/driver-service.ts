import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import {
  adoptReferencedDrivers,
  collectReferencedDriverIds,
  deleteDriverDir,
  DriverBundleValidationError,
  parseDriverBundle,
  projectDriversDir,
  readDriverBundle,
  writeDriverBundle,
  type IDriverBundle,
} from '@falang/desktop-arduino-dto';
import { findDriverUsages } from '@falang/desktop-arduino-compiler';
import type { IDriverValidationProject } from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';
import type {
  IDriverAdoptResult,
  IDriverCreateFromTemplateResult,
  IDriverListPayload,
  IDriverValidationResult,
  TDriverDeleteResult,
  TDriverEditScope,
  TDriverScope,
} from '../../shared/driver-ipc-types.js';
import type { ILoadedDriver } from './driver-registry.js';
import type { ProjectDriverRegistry } from './project-driver-registry.js';
import { toDriverProjectContext } from './project-context.js';

/**
 * Everything the `drivers:*` IPC handlers do, as plain functions over injected dependencies (ADR 0054
 * (private) §3) — validation, the on-disk copies between scopes, adoption, delete-with-usages. The Electron
 * parts (dialogs, `shell`, events) stay in `ipc-handlers.ts`.
 */
export interface IDriverServiceDeps {
  readonly registry: ProjectDriverRegistry;
  readonly bundledDir: string;
  readonly libraryDir: string;
  readonly readProjectContext: (projectDir: string) => Promise<IDriverValidationProject>;
  readonly validate: (bundle: unknown, scope: TDriverEditScope) => Promise<IDriverValidationResult>;
  /** Tell the project watcher / library watcher a write is ours, so it does not echo back as an external change. */
  readonly markOwnProjectWrite: () => void;
  readonly markOwnLibraryWrite: () => void;
  /**
   * Wraps every write into the *project* (`<project>/falang/drivers/`) — the host passes `withAutoVersion`, so a driver
   * edit gets the same session-gap auto-commit of the pre-edit state a document write does. Library writes are not
   * project writes and never go through it. Applied at the leaf writers only (`save`, `remove`, `adoptReferenced`),
   * so the composite operations (`createFromTemplate`, `copy`, `importFolder` → `save`) never nest it.
   */
  readonly withProjectWrite?: <T>(projectDir: string, write: () => Promise<T>) => Promise<T>;
}

/** A build was refused because a driver the project uses is `invalid-on-disk`/`load-error` (ADR 0054 (private) §5). */
export class DriverBuildBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverBuildBlockedError';
  }
}

const KEBAB = /^[a-z][a-z0-9-]*$/;

const failure = (message: string): IDriverValidationResult => ({
  ok: false,
  errors: [{ stage: 'schema', message }],
  warnings: [],
});

const errorMessages = (error: unknown): string[] =>
  error instanceof DriverBundleValidationError
    ? [...error.messages]
    : [error instanceof Error ? error.message : String(error)];

/** A minimal valid driver: one action blinking a pin, functions prefixed with the driver id so they never collide. */
export const buildTemplateBundle = (id: string, label: string): IDriverBundle => {
  const prefix = `${id.replaceAll('-', '_')}_`;
  const fn = `${prefix}blink`;
  return parseDriverBundle({
    formatVersion: 1,
    config: {
      id,
      label,
      notes: `${label}: a custom driver (edit me).`,
      includes: [`${id}.h`],
      sourceFiles: [`${id}.h`, `${id}.cpp`],
      declarations: [`declare function ${fn}(pin: number, times: number): void;`],
      actions: [
        {
          id: 'blink',
          label: 'Blink',
          notes: 'Blinks an LED on a pin the given number of times.',
          fields: [
            { name: 'pin', label: 'Pin', kind: 'pin', default: '13' },
            { name: 'times', label: 'Times', kind: 'number', default: '3', min: 1, max: 100 },
          ],
          codeTemplate: `${fn}(\${pin}, \${times})`,
        },
      ],
    },
    files: {
      [`${id}.h`]: `#pragma once\n#include <stdint.h>\n\nvoid ${fn}(uint8_t pin, uint8_t times);\n`,
      [`${id}.cpp`]: `#include <Arduino.h>\n#include "${id}.h"\n\nvoid ${fn}(uint8_t pin, uint8_t times) {\n  pinMode(pin, OUTPUT);\n  for (uint8_t i = 0; i < times; i++) {\n    digitalWrite(pin, HIGH);\n    delay(100);\n    digitalWrite(pin, LOW);\n    delay(100);\n  }\n}\n`,
    },
  });
};

export const createDriverService = (deps: IDriverServiceDeps) => {
  const { registry } = deps;

  const requireProjectDir = (): string => {
    const dir = registry.getProjectDir();
    if (!dir) throw new Error('No project is open');
    return dir;
  };

  const scopeDir = (scope: TDriverScope): string => {
    if (scope === 'bundled') return deps.bundledDir;
    if (scope === 'library') return deps.libraryDir;
    return projectDriversDir(requireProjectDir());
  };

  const projectWrite = <T>(projectDir: string, write: () => Promise<T>): Promise<T> =>
    deps.withProjectWrite ? deps.withProjectWrite(projectDir, write) : write();

  const markOwn = (scope: TDriverEditScope): void =>
    scope === 'project' ? deps.markOwnProjectWrite() : deps.markOwnLibraryWrite();

  const get = (id: string, scope: TDriverScope): Promise<IDriverBundle> =>
    readDriverBundle(path.join(scopeDir(scope), id));

  const validate = (bundle: unknown, scope: TDriverEditScope): Promise<IDriverValidationResult> =>
    deps.validate(bundle, scope);

  const save = async (bundle: unknown, scope: TDriverEditScope): Promise<IDriverValidationResult> => {
    if (scope === 'project') requireProjectDir();
    const validation = await deps.validate(bundle, scope);
    if (!validation.ok) return validation;
    const write = async (): Promise<void> => {
      markOwn(scope);
      await fs.mkdir(scopeDir(scope), { recursive: true });
      await writeDriverBundle(scopeDir(scope), parseDriverBundle(bundle));
      markOwn(scope);
    };
    await (scope === 'project' ? projectWrite(requireProjectDir(), write) : write());
    await registry.reload();
    return validation;
  };

  const remove = async (id: string, scope: TDriverEditScope): Promise<TDriverDeleteResult> => {
    if (scope === 'project') {
      const projectDir = requireProjectDir();
      const entry = registry.getPayload().drivers.find((driver) => driver.config.id === id);
      // A copy that shadows a library/bundled driver of the same id leaves the id resolvable after the delete.
      if (!entry?.overrides) {
        const usages = findDriverUsages(id, await deps.readProjectContext(projectDir));
        if (usages.length > 0) return { deleted: false, usages };
      }
    }
    const write = async (): Promise<void> => {
      markOwn(scope);
      await deleteDriverDir(scopeDir(scope), id);
      markOwn(scope);
    };
    await (scope === 'project' ? projectWrite(requireProjectDir(), write) : write());
    await registry.reload();
    return { deleted: true };
  };

  const copy = async (id: string, from: TDriverEditScope, to: TDriverEditScope): Promise<IDriverValidationResult> => {
    const read = await get(id, from).then(
      (bundle) => ({ bundle }),
      (error: unknown) => ({ error }),
    );
    if ('error' in read) {
      return failure(`cannot read driver "${id}" from the ${from}: ${errorMessages(read.error).join('; ')}`);
    }
    return save(read.bundle, to);
  };

  const importFolder = async (dir: string, scope: TDriverEditScope): Promise<IDriverValidationResult> => {
    const read = await readDriverBundle(dir).then(
      (bundle) => ({ bundle }),
      (error: unknown) => ({ error }),
    );
    if ('error' in read) {
      return {
        ok: false,
        errors: errorMessages(read.error).map((message) => ({ stage: 'schema' as const, message })),
        warnings: [],
      };
    }
    return save(read.bundle, scope);
  };

  const createFromTemplate = async (id: string, label: string): Promise<IDriverCreateFromTemplateResult> => {
    const projectDir = requireProjectDir();
    if (!KEBAB.test(id)) return { validation: failure('the driver id must be kebab-case (a-z, 0-9, "-")') };
    if (label.trim() === '') return { validation: failure('the driver needs a label') };
    const exists = await fs.access(path.join(projectDriversDir(projectDir), id)).then(
      () => true,
      () => false,
    );
    if (exists) return { validation: failure(`a project driver "${id}" already exists`) };
    const validation = await save(buildTemplateBundle(id, label.trim()), 'project');
    return validation.ok ? { validation, dir: path.join(projectDriversDir(projectDir), id) } : { validation };
  };

  /** Copies referenced library drivers into the project; a no-op reload-wise when nothing was copied. */
  const adoptFrom = async (
    projectDir: string,
    context: IDriverValidationProject,
    reload = true,
  ): Promise<IDriverAdoptResult> => {
    const result = await adoptReferencedDrivers({
      bundledDir: deps.bundledDir,
      libraryDir: deps.libraryDir,
      projectDir,
      documents: context.documents,
      devicesData: context.devicesData,
    });
    if (result.adopted.length > 0) {
      deps.markOwnProjectWrite();
      if (reload) await registry.reload();
    }
    return result;
  };

  const adoptReferenced = async (projectDir: string): Promise<IDriverAdoptResult> => {
    const context = await deps.readProjectContext(projectDir);
    return projectWrite(projectDir, () => adoptFrom(projectDir, context));
  };

  /** Project create/open (call site 1): adopt what the project references, then point the registry at it (one reload). */
  const openProject = async (projectDir: string): Promise<IDriverAdoptResult> => {
    const adopted = await adoptFrom(projectDir, await deps.readProjectContext(projectDir), false);
    await registry.setProject(projectDir);
    return adopted;
  };

  /** After a version restore swapped `falang/drivers/` under us. */
  const reloadAfterRestore = async (projectDir: string): Promise<void> => {
    // Not `adoptReferenced`: the restore just committed this state, no auto-version wrapper wanted here.
    await adoptFrom(projectDir, await deps.readProjectContext(projectDir), false);
    await registry.reload();
  };

  /** Before every build (call site 3): adopt what the given documents reference, then hand back bundled ∪ project drivers. */
  const prepareBuildDrivers = async (
    projectDir: string,
    documents: readonly IProjectDocument[],
  ): Promise<ILoadedDriver[]> => {
    const context = toDriverProjectContext(documents);
    await adoptFrom(projectDir, context);
    const used = collectReferencedDriverIds(context.documents, context.devicesData);
    const broken = registry
      .getPayload()
      .drivers.filter((driver) => used.has(driver.config.id) && driver.status !== 'ok');
    if (broken.length > 0) {
      const lines = broken.map(
        (driver) => `- ${driver.config.id} (${driver.status}): ${(driver.errors ?? []).join('; ')}`,
      );
      throw new DriverBuildBlockedError(
        `Cannot build: these drivers are used by the project but are invalid on disk — fix or restore them first:\n${lines.join('\n')}`,
      );
    }
    return registry.buildDrivers();
  };

  return {
    list: (): IDriverListPayload => registry.getPayload(),
    get,
    validate,
    save,
    delete: remove,
    saveToLibrary: (id: string) => copy(id, 'project', 'library'),
    addFromLibrary: (id: string) => copy(id, 'library', 'project'),
    replaceWithLibrary: (id: string) => copy(id, 'library', 'project'),
    importFolder,
    createFromTemplate,
    adoptReferenced,
    openProject,
    reloadAfterRestore,
    prepareBuildDrivers,
    driverDir: (id: string, scope: TDriverScope): string => path.join(scopeDir(scope), id),
  };
};

export type TDriverService = ReturnType<typeof createDriverService>;

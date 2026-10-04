import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NodesGroup, NodesStack } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import {
  ProjectDriverRegistry,
  validateDriverBundle,
  type IDriverListEntry,
  type TDriverStatus,
} from '@falang/desktop-arduino-compiler';
import {
  arduinoFunctionNodeConfigs,
  buildDriverNodeConfigs,
  pinNodeConfigs,
  projectDriversDir,
  type IDriverConfig,
} from '@falang/desktop-arduino-dto';
import type { DocumentStackRegistry } from '@falang/mcp-core';
import { readProjectContext } from './project-context.js';

const ARDUINO_PROJECT_TYPE = 'arduino';
const ARDUINO_FUNCTION_DOCUMENT_TYPE = 'function';

export type TDriverScope = 'bundled' | 'library' | 'project';

export interface IServedDriver {
  /** The config the project is served with: the last valid one when the files on disk stopped validating. */
  readonly config: IDriverConfig;
  readonly status: TDriverStatus;
  /** Why `status` isn't `ok`. */
  readonly errors?: readonly string[];
  readonly dir: string;
  readonly scope: TDriverScope;
  /** The lower-precedence scope this driver shadows, if any (project > library > bundled). */
  readonly overrides?: 'bundled' | 'library';
}

export interface IBrokenDriver {
  readonly id: string;
  readonly dir: string;
  readonly scope: TDriverScope;
  readonly message: string;
}

export interface IArduinoDriversStateParams {
  readonly registry: DocumentStackRegistry;
  readonly projectDir: string;
  /** Every directory to scan, lowest precedence first (a later one wins an id collision). The project's own `falang/drivers/` is appended when missing. */
  readonly dirs: readonly string[];
  /** Which of `dirs` is the user's library (everything else except the project dir is treated as bundled). */
  readonly libraryDir?: string;
}

/** (Re-)registers the `'arduino'` project type with one `driver-action::…` kind per action of `configs`. */
export const registerArduinoStack = (registry: DocumentStackRegistry, configs: readonly IDriverConfig[]): void => {
  const stack = new NodesStack([
    functionNodesGroup,
    new NodesGroup(pinNodeConfigs),
    new NodesGroup(arduinoFunctionNodeConfigs),
    new NodesGroup(buildDriverNodeConfigs(configs)),
  ]);
  registry.registerProjectType(ARDUINO_PROJECT_TYPE, {
    [ARDUINO_FUNCTION_DOCUMENT_TYPE]: { rootNodeName: ARDUINO_FUNCTION_DOCUMENT_TYPE, stack },
  });
};

const toServed = ({ entry, dir }: { entry: IDriverListEntry; dir: string }): IServedDriver => ({
  config: entry.config,
  dir,
  scope: entry.scope,
  status: entry.status,
  ...(entry.errors ? { errors: entry.errors } : {}),
  ...(entry.overrides ? { overrides: entry.overrides } : {}),
});

/**
 * The Arduino MCP host's view of the driver folders (ADR 0054 (private) §7): a `ProjectDriverRegistry` — the same one
 * the app uses, so a driver that stops validating on disk keeps being served by its last valid config and flagged
 * (`invalid-on-disk` / `load-error` / `missing-on-disk`) — plus the `'arduino'` project type's `NodesStack`, re-registered
 * after a write and, cheaply by comparing directory mtimes, whenever someone else changed a driver since the last load.
 * This process has no file watcher and (like the app's watcher reloads) no `arduino-cli` stage on a rescan.
 */
export class ArduinoDriversState {
  readonly projectDir: string;
  readonly libraryDir: string | null;
  readonly projectDriversDirPath: string;
  private readonly dirs: readonly string[];
  private readonly registry: DocumentStackRegistry;
  private readonly drivers_: ProjectDriverRegistry;
  private served: readonly IServedDriver[] = [];
  private stamp = '';
  private chain: Promise<unknown> = Promise.resolve();

  constructor(params: IArduinoDriversStateParams) {
    this.registry = params.registry;
    this.projectDir = params.projectDir;
    this.libraryDir = params.libraryDir ? path.resolve(params.libraryDir) : null;
    this.projectDriversDirPath = path.resolve(projectDriversDir(params.projectDir));
    const dirs = params.dirs.map((dir) => path.resolve(dir));
    this.dirs = dirs.includes(this.projectDriversDirPath) ? dirs : [...dirs, this.projectDriversDirPath];
    const bundledDirs = this.dirs.filter((dir) => dir !== this.projectDriversDirPath && dir !== this.libraryDir);
    this.drivers_ = new ProjectDriverRegistry({
      bundledDir: bundledDirs,
      libraryDir: this.libraryDir,
      projectDir: params.projectDir,
      readProjectContext,
      validate: (items) =>
        Promise.all(
          items.map((item) =>
            validateDriverBundle(item.bundle, {
              otherDrivers: item.ctx.otherDrivers,
              ...(item.ctx.project ? { project: item.ctx.project } : {}),
            }),
          ),
        ),
    });
  }

  /** Directory a driver of `scope` lives in for writes (`bundled` is never writable). */
  scopeDir(scope: 'library' | 'project'): string | null {
    return scope === 'project' ? this.projectDriversDirPath : this.libraryDir;
  }

  /** The effective driver per id (last valid config, with its status). */
  get drivers(): readonly IServedDriver[] {
    return this.served;
  }

  /** Folders that could not be loaded and have no earlier valid version to serve. */
  get brokenDrivers(): readonly IBrokenDriver[] {
    return this.drivers_.getPayload().loadErrors.map((error) => ({
      dir: error.dir,
      id: path.basename(error.dir),
      message: error.message,
      scope: error.scope,
    }));
  }

  /** `scope` omitted → the effective (highest-precedence) driver with that id. */
  lookup(id: string, scope: TDriverScope | null = null): IServedDriver | undefined {
    if (scope === null) return this.served.find((driver) => driver.config.id === id);
    return this.all.find((driver) => driver.config.id === id && driver.scope === scope);
  }

  /** Every driver found, including ones shadowed by a higher scope. */
  all: readonly IServedDriver[] = [];

  /** Every effective driver plus the on-disk configs of the shadowed ones. */
  private collect(): void {
    this.served = this.drivers_.getEntries().map((item) => toServed(item));
    const shadowed: IServedDriver[] = this.drivers_
      .getShadowed()
      .map((driver) => ({ config: driver.config, dir: driver.dir, scope: driver.scope, status: 'ok' as const }));
    this.all = [...shadowed, ...this.served];
  }

  private async computeStamp(): Promise<string> {
    const parts = await Promise.all(
      this.dirs.map(async (dir) => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const stats = await Promise.all(
            entries
              .filter((entry) => entry.isDirectory())
              .map(async (entry) => {
                const full = path.join(dir, entry.name);
                const [own, config] = await Promise.all([
                  fs.stat(full),
                  fs.stat(path.join(full, 'driver.config.json')).catch(() => null),
                ]);
                return `${entry.name}:${own.mtimeMs}:${config?.mtimeMs ?? 0}:${config?.size ?? 0}`;
              }),
          );
          return `${dir}=${stats.toSorted().join(',')}`;
        } catch {
          return `${dir}=missing`;
        }
      }),
    );
    return parts.join('|');
  }

  /** Reload when any driver folder changed since the last load; cheap (stats only) otherwise. */
  ensureFresh(): Promise<void> {
    const next = this.chain.then(async () => {
      if ((await this.computeStamp()) !== this.stamp) await this.reloadNow();
    });
    this.chain = next.catch(() => null);
    return next;
  }

  /** Unconditional reload (call after any write of ours). */
  reload(): Promise<void> {
    const next = this.chain.then(() => this.reloadNow());
    this.chain = next.catch(() => null);
    return next;
  }

  private async reloadNow(): Promise<void> {
    const stamp = await this.computeStamp();
    await this.drivers_.reload();
    this.collect();
    this.stamp = stamp;
    registerArduinoStack(
      this.registry,
      this.served.map((driver) => driver.config),
    );
  }
}

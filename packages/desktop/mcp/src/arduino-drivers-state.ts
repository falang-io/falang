import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NodesGroup, NodesStack } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import {
  arduinoFunctionNodeConfigs,
  buildDriverNodeConfigs,
  pinNodeConfigs,
  projectDriversDir,
  scanDriversDir,
  type IDriverConfig,
  type IDriverLoadError,
} from '@falang/desktop-arduino-dto';
import type { DocumentStackRegistry } from '@falang/mcp-core';
const ARDUINO_PROJECT_TYPE = 'arduino';
const ARDUINO_FUNCTION_DOCUMENT_TYPE = 'function';

export type TDriverScope = 'bundled' | 'library' | 'project';

export interface IServedDriver {
  readonly config: IDriverConfig;
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

const toBroken = (error: IDriverLoadError, scope: TDriverScope): IBrokenDriver => ({
  id: path.basename(error.dir),
  dir: error.dir,
  scope,
  message: error.message,
});

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

/**
 * The Arduino MCP host's view of the driver folders (ADR 0054 (private) §7): scans bundled ∪ library ∪ project
 * (project > library > bundled), re-registers the `'arduino'` project type's `NodesStack` after a write and —
 * cheaply, by comparing directory mtimes — whenever a driver was changed by someone else since the last load,
 * so a driver the app (or the user's editor) just wrote is visible in the same MCP session.
 */
export class ArduinoDriversState {
  readonly projectDir: string;
  readonly libraryDir: string | null;
  readonly projectDriversDirPath: string;
  private readonly dirs: readonly string[];
  private readonly registry: DocumentStackRegistry;
  private served: readonly IServedDriver[] = [];
  private broken: readonly IBrokenDriver[] = [];
  private stamp = '';
  private chain: Promise<unknown> = Promise.resolve();

  constructor(params: IArduinoDriversStateParams) {
    this.registry = params.registry;
    this.projectDir = params.projectDir;
    this.libraryDir = params.libraryDir ? path.resolve(params.libraryDir) : null;
    this.projectDriversDirPath = path.resolve(projectDriversDir(params.projectDir));
    const dirs = params.dirs.map((dir) => path.resolve(dir));
    this.dirs = dirs.includes(this.projectDriversDirPath) ? dirs : [...dirs, this.projectDriversDirPath];
  }

  private scopeOf(dir: string): TDriverScope {
    if (dir === this.projectDriversDirPath) return 'project';
    if (this.libraryDir !== null && dir === this.libraryDir) return 'library';
    return 'bundled';
  }

  /** Directory a driver of `scope` lives in for writes (`bundled` is never writable). */
  scopeDir(scope: 'library' | 'project'): string | null {
    return scope === 'project' ? this.projectDriversDirPath : this.libraryDir;
  }

  get drivers(): readonly IServedDriver[] {
    return this.served;
  }

  get brokenDrivers(): readonly IBrokenDriver[] {
    return this.broken;
  }

  /** `scope` omitted → the effective (highest-precedence) driver with that id. */
  lookup(id: string, scope: TDriverScope | null = null): IServedDriver | undefined {
    if (scope === null) return this.served.find((driver) => driver.config.id === id);
    return this.all.find((driver) => driver.config.id === id && driver.scope === scope);
  }

  /** Every driver found, including ones shadowed by a higher scope. */
  all: readonly IServedDriver[] = [];

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
    const scans = await Promise.all(this.dirs.map((dir) => scanDriversDir(dir)));
    const byId = new Map<string, IServedDriver>();
    const all: IServedDriver[] = [];
    const broken: IBrokenDriver[] = [];
    scans.forEach((scan, index) => {
      const scope = this.scopeOf(this.dirs[index]);
      for (const driver of scan.drivers) {
        const previous = byId.get(driver.config.id);
        const served: IServedDriver = {
          config: driver.config,
          dir: driver.dir,
          scope,
          ...(previous && previous.scope !== scope ? { overrides: previous.scope as 'bundled' | 'library' } : {}),
        };
        byId.set(driver.config.id, served);
        all.push(served);
      }
      for (const error of scan.errors) broken.push(toBroken(error, scope));
    });
    this.served = [...byId.values()];
    this.all = all;
    this.broken = broken;
    this.stamp = stamp;
    registerArduinoStack(
      this.registry,
      this.served.map((driver) => driver.config),
    );
  }
}

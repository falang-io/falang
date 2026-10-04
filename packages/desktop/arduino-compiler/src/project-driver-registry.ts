import * as path from 'node:path';
import {
  driverContentHash,
  readDriverBundle,
  resolveProjectDrivers,
  type IDriverBundle,
  type IDriverConfig,
  type IResolvedDriver,
} from '@falang/desktop-arduino-dto';
import type { ILoadedDriver } from '@falang/desktop-arduino-dto';
import type { IDriverValidationProject, IDriverValidationResult } from './driver-validation-types.js';
import type {
  IDriverListEntry,
  IDriverListPayload,
  IDriverLoadErrorEntry,
  TDriverEditScope,
  TDriverScope,
} from './driver-list-types.js';
import { bundleErrors, describeIssues, othersSignature, withScope } from './driver-registry-helpers.js';
import { keepReferencedMissing } from './referenced-missing.js';

/**
 * The per-project driver registry shared by the Arduino app's `main` and the MCP server (ADR 0054 (private) §3): bundled ∪ library ∪
 * project drivers resolved with precedence project > library > bundled, each library/project driver
 * validated, with the **last valid** version of every driver kept for the session — a driver whose files
 * stop validating on disk (a hand edit, a git checkout) keeps being served as it was and is flagged
 * `invalid-on-disk`. Plain Node: the validator (which runs in a worker process) and the project-context
 * reader are injected.
 */
export interface IDriverCheckItem {
  readonly bundle: IDriverBundle;
  readonly ctx: {
    readonly otherDrivers: readonly (IDriverConfig & { readonly scope?: TDriverScope })[];
    readonly project?: IDriverValidationProject;
  };
}

/** Validates a batch with stages 1–3 and 5 (no `arduino-cli`); one result per item, same order. */
export type TDriverBatchValidator = (items: readonly IDriverCheckItem[]) => Promise<IDriverValidationResult[]>;

export interface IProjectDriverRegistryParams {
  readonly bundledDir: string | readonly string[];
  /** `null`: no personal library (MCP without one). */
  readonly libraryDir: string | null;
  readonly validate: TDriverBatchValidator;
  /** The project to start with (default none); `setProject` switches it later. */
  readonly projectDir?: string | null;
  readonly readProjectContext: (projectDir: string) => Promise<IDriverValidationProject | null>;
}

const MAX_CACHED_RESULTS = 200;

interface ILastValid {
  readonly config: IDriverConfig;
  readonly dir: string;
}

interface ISlot {
  readonly resolved: IResolvedDriver;
  bundle: IDriverBundle | null;
  readError: string[] | null;
}

interface IServed {
  entry: IDriverListEntry;
  dir: string;
}

export class ProjectDriverRegistry {
  private readonly params: IProjectDriverRegistryParams;
  private projectDir: string | null = null;
  private payload: IDriverListPayload = { drivers: [], loadErrors: [] };
  private entries: IServed[] = [];
  private shadowed: readonly IResolvedDriver[] = [];
  private readonly lastValid = new Map<string, ILastValid>();
  private readonly results = new Map<string, IDriverValidationResult>();
  private readonly listeners = new Set<(payload: IDriverListPayload) => void>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(params: IProjectDriverRegistryParams) {
    this.params = params;
    this.projectDir = params.projectDir ?? null;
  }

  /** Switches to another project (or none) and reloads; the "last valid" memory is per project. */
  setProject(projectDir: string | null): Promise<IDriverListPayload> {
    this.projectDir = projectDir;
    this.lastValid.clear();
    return this.reload();
  }

  getProjectDir(): string | null {
    return this.projectDir;
  }

  getPayload(): IDriverListPayload {
    return this.payload;
  }

  onChange(listener: (payload: IDriverListPayload) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Every served entry (the effective driver per id) with the directory it is served from. */
  getEntries(): readonly { readonly entry: IDriverListEntry; readonly dir: string }[] {
    return this.entries;
  }

  /** Drivers hidden by a higher-precedence one of the same id, as found on disk (not validated). */
  getShadowed(): readonly IResolvedDriver[] {
    return this.shadowed;
  }

  /** What a build compiles with: bundled ∪ project drivers (a library driver only counts once adopted into the project). */
  buildDrivers(): ILoadedDriver[] {
    return this.entries
      .filter(({ entry }) => entry.scope !== 'library')
      .map(({ entry, dir }) => ({ config: entry.config, dir }));
  }

  /** The other drivers a driver saved in `scope` has to coexist with (name collisions): bundled + the same scope. */
  otherDriversFor(scope: TDriverEditScope): (IDriverConfig & { scope: TDriverScope })[] {
    return this.entries
      .filter(({ entry }) => entry.scope === 'bundled' || entry.scope === scope)
      .map(({ entry }) => withScope(entry.config, entry.scope));
  }

  reload(): Promise<IDriverListPayload> {
    const next = this.chain.then(
      () => this.reloadNow(),
      () => this.reloadNow(),
    );
    this.chain = next;
    return next;
  }

  private async reloadNow(): Promise<IDriverListPayload> {
    const { bundledDir, libraryDir } = this.params;
    const { projectDir } = this;
    const resolved = await resolveProjectDrivers({ bundledDir, libraryDir, projectDir });
    this.shadowed = resolved.shadowed;
    const slots = await Promise.all(resolved.drivers.map((driver) => this.readSlot(driver)));
    const verdicts = await this.validateSlots(slots, projectDir);

    const byId = new Map<string, IServed>();
    const seen = new Set<string>();
    for (const [index, slot] of slots.entries()) {
      seen.add(`${slot.resolved.scope}:${slot.resolved.config.id}`);
      byId.set(slot.resolved.config.id, this.serve(slot, verdicts[index]));
    }
    const loadErrors = this.applyLoadErrors(byId, resolved.errors, seen);
    await keepReferencedMissing({ byId, seen, ...this.params, lastValid: this.lastValid, projectDir });
    for (const key of this.lastValid.keys()) if (!seen.has(key)) this.lastValid.delete(key);

    this.entries = await this.withLibraryComparison([...byId.values()], slots);
    this.payload = { drivers: this.entries.map(({ entry }) => entry), loadErrors };
    for (const listener of this.listeners) listener(this.payload);
    return this.payload;
  }

  /** One slot's list entry: the on-disk config when valid (remembered as last valid), else the last valid one flagged. */
  private serve(slot: ISlot, verdict: IDriverValidationResult | null): IServed {
    const { config, scope, overrides, dir } = slot.resolved;
    const key = `${scope}:${config.id}`;
    const base: IDriverListEntry = { config, scope, status: 'ok', ...(overrides ? { overrides } : {}) };
    if (verdict && verdict.errors.length === 0) {
      this.lastValid.set(key, { config, dir });
      return { entry: base, dir };
    }
    const errors = verdict ? describeIssues(verdict) : slot.readError;
    if (!errors) return { entry: base, dir };
    const previous = this.lastValid.get(key);
    return {
      entry: { ...base, config: previous?.config ?? config, status: 'invalid-on-disk', errors },
      dir: previous?.dir ?? dir,
    };
  }

  /** Folders that failed to scan: serve the last valid version as `load-error`, or report them when there is none. */
  private applyLoadErrors(
    byId: Map<string, IServed>,
    errors: readonly { dir: string; scope: TDriverScope; message: string }[],
    seen: Set<string>,
  ): IDriverLoadErrorEntry[] {
    const loadErrors: IDriverLoadErrorEntry[] = [];
    for (const error of errors) {
      const id = path.basename(error.dir);
      seen.add(`${error.scope}:${id}`);
      const previous = this.lastValid.get(`${error.scope}:${id}`);
      if (!previous) {
        loadErrors.push({ dir: error.dir, scope: error.scope, message: error.message });
        continue;
      }
      const shadowed = byId.get(id);
      if (shadowed?.entry.scope === error.scope) continue;
      byId.set(id, {
        entry: {
          config: previous.config,
          scope: error.scope,
          status: 'load-error',
          errors: [error.message],
          ...(shadowed ? { overrides: shadowed.entry.scope as 'bundled' | 'library' } : {}),
        },
        dir: previous.dir,
      });
    }
    return loadErrors;
  }

  private async readSlot(resolved: IResolvedDriver): Promise<ISlot> {
    if (resolved.scope === 'bundled') return { resolved, bundle: null, readError: null };
    try {
      return { resolved, bundle: await readDriverBundle(resolved.dir), readError: null };
    } catch (error) {
      return { resolved, bundle: null, readError: bundleErrors(error) };
    }
  }

  /** Verdict per slot: `null` for a bundled driver (trusted) or one that could not even be read. */
  private async validateSlots(
    slots: readonly ISlot[],
    projectDir: string | null,
  ): Promise<(IDriverValidationResult | null)[]> {
    const verdicts: (IDriverValidationResult | null)[] = slots.map(() => null);
    const pending: { index: number; key: string; item: IDriverCheckItem }[] = [];
    const hasProjectSlot = slots.some((slot) => slot.resolved.scope === 'project' && slot.bundle);
    const project =
      projectDir !== null && hasProjectSlot ? await this.params.readProjectContext(projectDir).catch(() => null) : null;
    for (const [index, slot] of slots.entries()) {
      const { bundle } = slot;
      const scope = slot.resolved.scope as TDriverEditScope | 'bundled';
      if (!bundle || scope === 'bundled') continue;
      const otherDrivers = this.otherDriversOf(slots, scope, bundle.config.id);
      const key = `${scope}|${driverContentHash(bundle)}|${othersSignature(otherDrivers)}`;
      const cached = this.results.get(key);
      if (cached) {
        verdicts[index] = cached;
        continue;
      }
      const projectCtx = scope === 'project' && project ? { project } : {};
      pending.push({ index, key, item: { bundle, ctx: { otherDrivers, ...projectCtx } } });
    }
    if (pending.length > 0) {
      const results = await this.params.validate(pending.map(({ item }) => item));
      for (const [position, { index, key }] of pending.entries()) {
        const result = results[position];
        verdicts[index] = result;
        if (this.results.size >= MAX_CACHED_RESULTS) this.results.clear();
        this.results.set(key, result);
      }
    }
    return verdicts;
  }

  private otherDriversOf(
    slots: readonly ISlot[],
    scope: TDriverEditScope,
    selfId: string,
  ): (IDriverConfig & { scope: TDriverScope })[] {
    return slots
      .map((slot) => slot.resolved)
      .filter((driver) => (driver.scope === 'bundled' || driver.scope === scope) && driver.config.id !== selfId)
      .map((driver) => withScope(driver.config, driver.scope));
  }

  private async differsFromLibrary(item: IServed, slots: readonly ISlot[]): Promise<IServed> {
    if (item.entry.scope !== 'project' || item.entry.overrides !== 'library') return item;
    const { libraryDir } = this.params;
    if (libraryDir === null) return item;
    const id = item.entry.config.id;
    const mine = slots.find((slot) => slot.resolved.scope === 'project' && slot.resolved.config.id === id)?.bundle;
    try {
      const library = await readDriverBundle(path.join(libraryDir, id));
      const differs = !mine || driverContentHash(mine) !== driverContentHash(library);
      return { ...item, entry: { ...item.entry, differsFromLibrary: differs } };
    } catch {
      return item;
    }
  }

  private withLibraryComparison(served: IServed[], slots: readonly ISlot[]): Promise<IServed[]> {
    return Promise.all(served.map((item) => this.differsFromLibrary(item, slots)));
  }
}

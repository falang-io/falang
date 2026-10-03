// The custom-driver IPC contract (ADR 0054 (private)) — plain types shared by `main`, `preload` and the
// renderer. Deep type-only imports on purpose: the packages' barrels pull `node:*` modules into a
// renderer bundle (see `driver-config.ts`'s own comment).
import type { IDriverBundle } from '@falang/desktop-arduino-dto/src/driver-bundle.js';
import type {
  IDriverUsage,
  IDriverValidationResult,
} from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';
import type { IDriverConfig } from './driver-config.js';

export type { IDriverBundle, IDriverUsage, IDriverValidationResult };

export type TDriverScope = 'bundled' | 'library' | 'project';
/** The two scopes a user can write to. */
export type TDriverEditScope = 'library' | 'project';

/**
 * `ok`: the driver on disk validates. `invalid-on-disk`: it was valid earlier in this session but the files
 * on disk (hand-edited, a git checkout, …) no longer validate — the last valid `config` keeps being served
 * and `errors` says what is wrong now. `load-error`: its folder could not be read at all (last valid one
 * served, if any). `missing-on-disk`: its folder was deleted externally but the project still uses it — the last valid
 * config keeps being served (so open schemes keep their node kinds) and a build is blocked.
 */
export type TDriverStatus = 'ok' | 'invalid-on-disk' | 'load-error' | 'missing-on-disk';

export interface IDriverListEntry {
  readonly config: IDriverConfig;
  readonly scope: TDriverScope;
  readonly status: TDriverStatus;
  /** The lower-precedence scope this driver shadows (project > library > bundled). */
  readonly overrides?: 'bundled' | 'library';
  /** Project scope only: the library holds a driver with the same id and different content. */
  readonly differsFromLibrary?: boolean;
  readonly errors?: readonly string[];
}

export interface IDriverLoadErrorEntry {
  readonly dir: string;
  readonly scope: TDriverScope;
  readonly message: string;
}

/** Result of `drivers:list` and payload of the `drivers:changed` event. */
export interface IDriverListPayload {
  readonly drivers: readonly IDriverListEntry[];
  /** Driver folders that could not be loaded and have no earlier valid version to serve. */
  readonly loadErrors: readonly IDriverLoadErrorEntry[];
}

export type TDriverDeleteResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly usages: readonly IDriverUsage[] };

export type TDriverFileResult = { readonly canceled: true } | { readonly canceled: false; readonly path: string };

export type TDriverImportFileResult =
  | { readonly canceled: true }
  | { readonly canceled: false; readonly validation: IDriverValidationResult; readonly id?: string };

export interface IDriverCreateFromTemplateResult {
  readonly validation: IDriverValidationResult;
  /** The new driver's folder (project scope) when it was saved. */
  readonly dir?: string;
}

export interface IDriverAdoptResult {
  readonly adopted: readonly string[];
  readonly missing: readonly string[];
}

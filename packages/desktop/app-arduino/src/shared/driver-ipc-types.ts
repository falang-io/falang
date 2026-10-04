// The custom-driver IPC contract (ADR 0054 (private)) — plain types shared by `main`, `preload` and the
// renderer. Deep type-only imports on purpose: the packages' barrels pull `node:*` modules into a
// renderer bundle (see `driver-config.ts`'s own comment).
import type { IDriverBundle } from '@falang/desktop-arduino-dto/src/driver-bundle.js';
import type {
  IDriverUsage,
  IDriverValidationResult,
} from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';

export type { IDriverBundle, IDriverUsage, IDriverValidationResult };

export type {
  IDriverListEntry,
  IDriverListPayload,
  IDriverLoadErrorEntry,
  TDriverEditScope,
  TDriverScope,
  TDriverStatus,
} from '@falang/desktop-arduino-compiler/src/driver-list-types.js';

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

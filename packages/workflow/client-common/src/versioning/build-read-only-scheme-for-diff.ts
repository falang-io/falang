import type { DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import { VersionDiffModule, type ITheme, type Scheme, type TVersionDiffSide } from '@falang/scheme';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { buildReadOnlyScheme } from '../build-read-only-scheme.js';

export interface IBuildReadOnlySchemeForDiffParams {
  readonly document: ISnapshotDocument;
  readonly diff: INodeTreeDiff;
  readonly side: TVersionDiffSide;
  readonly projectId: string;
  readonly container: DependencyContainer;
  readonly theme: ITheme;
  /** Live read access to the project's current credential instances — same callback shape `WorkflowStore.buildScheme` passes its own live scheme, used here only for rendering the vendor action's display name/fields, not for anything that could ever run for real (the scheme is read-only). */
  readonly getCredentialInstances: () => readonly IIntegrationInstance[];
}

/**
 * `WorkflowStore.buildReadOnlySchemeForDiff` — a read-only scheme for one side of the split diff
 * view (ADR 0025 (private)): `buildReadOnlyScheme` plus `VersionDiffModule` (no
 * `HistoryModule`/agent/debugger/live-run — a diff scheme is never edited and is disposed as soon as
 * the comparison changes), its root taken from the snapshot document. `null` for a document type with no
 * scheme editor (the diff panel shows `integrations`' `dataFields` as a plain table instead).
 */
export const buildReadOnlySchemeForDiff = (params: IBuildReadOnlySchemeForDiffParams): Scheme | null => {
  const { document, diff, side, ...rest } = params;
  return buildReadOnlyScheme({ ...rest, document, extraModules: [new VersionDiffModule({ diff, side })] });
};

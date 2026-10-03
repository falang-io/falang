import type { DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import { VersionDiffModule, type Scheme, type TVersionDiffSide } from '@falang/scheme';
import { buildReadOnlyScheme } from './build-read-only-scheme.js';

export interface IBuildReadOnlySchemeForDiffParams {
  readonly document: ISnapshotDocument;
  readonly diff: INodeTreeDiff;
  readonly side: TVersionDiffSide;
  readonly container: DependencyContainer;
}

/**
 * `DesktopProjectStore.buildReadOnlySchemeForDiff` — a read-only scheme for one side of the split
 * diff view (ADR 0025 (private)), mirroring the workflow client's own
 * `build-read-only-scheme-for-diff.ts`: `buildReadOnlyScheme` plus `VersionDiffModule`.
 */
export const buildReadOnlySchemeForDiff = (params: IBuildReadOnlySchemeForDiffParams): Scheme | null => {
  const { document, diff, side, container } = params;
  return buildReadOnlyScheme({ document, container, extraModules: [new VersionDiffModule({ diff, side })] });
};

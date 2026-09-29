import type { DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import {
  createNodeStoreFromNode,
  setRootNodeForScheme,
  VersionDiffModule,
  type IModule,
  type Scheme,
  type TVersionDiffSide,
} from '@falang/scheme';
import { DOCUMENT_TYPES, type DocumentType } from '../desktop-project-store.js';

export interface IBuildReadOnlySchemeForDiffParams {
  readonly document: ISnapshotDocument;
  readonly diff: INodeTreeDiff;
  readonly side: TVersionDiffSide;
  readonly container: DependencyContainer;
}

/**
 * `DesktopProjectStore.buildReadOnlySchemeForDiff` — a read-only scheme for one side of the split
 * diff view (ADR 0025 (private)), mirroring the workflow client's own
 * `build-read-only-scheme-for-diff.ts`. Unlike that one, every `DocumentType` this app has is
 * scheme-typed (there's no `custom`/`integrations`-shaped document here), so this never returns
 * `null` for a recognized type — `DOCUMENT_TYPES[type].buildScheme` already knows how to build every
 * one of them, `readOnly: true` and `VersionDiffModule` are the only extras layered on top.
 */
export const buildReadOnlySchemeForDiff = (params: IBuildReadOnlySchemeForDiffParams): Scheme | null => {
  const { document, diff, side, container } = params;
  const config = DOCUMENT_TYPES[document.type as DocumentType];
  if (!config) return null;

  const extraModules: IModule[] = [new VersionDiffModule({ diff, side })];
  const scheme = config.buildScheme({
    id: document.id,
    name: document.name,
    parentContainer: container,
    readOnly: true,
    extraModules,
  });
  if (document.root) {
    const rootStore = createNodeStoreFromNode(document.root, scheme);
    setRootNodeForScheme(scheme, rootStore);
  }
  return scheme;
};

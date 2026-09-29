import type { DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import {
  createNodeStoreFromNode,
  setRootNodeForScheme,
  VersionDiffModule,
  type IModule,
  type ITheme,
  type Scheme,
  type TVersionDiffSide,
} from '@falang/scheme';
import { objectsStructureSchemeFactory } from '@falang/typescript-scheme';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { workflowFunctionalSchemeFactory } from '@falang/workflow-scheme';
import {
  createActivepiecesCatalogProvider,
  createActivepiecesFieldOptionsProvider,
  createFieldOptionsProvider,
} from '../integrations-document-helpers.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';

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
 * view (ADR 0025 (private)), pulled out of `WorkflowStore` itself to keep that
 * file's line count down. Same factory choice as `WorkflowStore.buildScheme` (function/trigger →
 * `workflowFunctionalSchemeFactory`, `objects-structure` → `objectsStructureSchemeFactory`) but with
 * `readOnly: true`, only `VersionDiffModule` as an extra module (no `HistoryModule`/`AgentModule`/
 * debugger/live-run — a diff scheme is never edited, never followed by a live run, and is disposed as
 * soon as the comparison changes), and its root taken from the snapshot document rather than the live
 * document list. Returns `null` for a document type with no scheme editor at all (e.g. the `custom`
 * `integrations` document — the diff panel shows its `dataFields` as a plain table instead, see
 * `VersionDiffView`).
 */
export const buildReadOnlySchemeForDiff = (params: IBuildReadOnlySchemeForDiffParams): Scheme | null => {
  const { document, diff, side, projectId, container, theme, getCredentialInstances } = params;
  const isFunctionDoc = document.type === 'function' || document.type === TRIGGER_FUNCTION_NAME;
  const isObjectsDoc = document.type === 'objects-structure';
  if (!isFunctionDoc && !isObjectsDoc) return null;

  const extraModules: IModule[] = [new VersionDiffModule({ diff, side })];
  const scheme = isFunctionDoc
    ? workflowFunctionalSchemeFactory({
        id: document.id,
        name: document.name,
        parentContainer: container,
        extraModules,
        readOnly: true,
        integrations: REGISTERED_INTEGRATIONS,
        getCredentialInstances,
        getFieldOptionsProvider: () => createFieldOptionsProvider(projectId),
        getActivepiecesCatalogProvider: () => createActivepiecesCatalogProvider(),
        getActivepiecesFieldOptionsProvider: () => createActivepiecesFieldOptionsProvider(projectId),
      })
    : objectsStructureSchemeFactory({
        id: document.id,
        name: document.name,
        extraModules,
        readOnly: true,
        parentContainer: container,
      });
  scheme.theme.setTheme(theme);
  if (document.root) {
    const rootStore = createNodeStoreFromNode(document.root, scheme);
    setRootNodeForScheme(scheme, rootStore);
  }
  return scheme;
};

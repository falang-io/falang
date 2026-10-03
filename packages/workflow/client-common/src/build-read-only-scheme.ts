import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { createNodeStoreFromNode, setRootNodeForScheme, type IModule, type ITheme, type Scheme } from '@falang/scheme';
import { objectsStructureSchemeFactory } from '@falang/typescript-scheme';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { workflowFunctionalSchemeFactory } from '@falang/workflow-scheme';
import {
  createActivepiecesCatalogProvider,
  createActivepiecesFieldOptionsProvider,
  createFieldOptionsProvider,
} from './integrations-document-helpers.js';
import { REGISTERED_INTEGRATIONS } from './integrations-registry.js';
import { ROOT_NODE, type DocumentType } from './workflow-types.js';

export interface IBuildReadOnlySchemeParams {
  readonly document: { readonly id: string; readonly name: string; readonly type: string; readonly root?: INode };
  readonly theme: ITheme;
  readonly extraModules?: readonly IModule[];
  readonly projectId: string;
  readonly container: DependencyContainer;
  /** Live read access to the project's credential instances (display only — the scheme is read-only). */
  readonly getCredentialInstances: () => readonly IIntegrationInstance[];
}

/**
 * A read-only scheme for one document — shared by the version-diff view (ADR 0025 (private)) and the PDF
 * print export (ADR 0048 (private)). Same factory choice as `WorkflowStore.buildScheme`
 * (function/trigger → `workflowFunctionalSchemeFactory`, `objects-structure` →
 * `objectsStructureSchemeFactory`) with `readOnly: true` and only the caller's `extraModules`. `null` for
 * a document type with no scheme editor (e.g. the `integrations` document).
 */
export const buildReadOnlyScheme = (params: IBuildReadOnlySchemeParams): Scheme | null => {
  const { document, projectId, container, theme, getCredentialInstances } = params;
  const isFunctionDoc = document.type === 'function' || document.type === TRIGGER_FUNCTION_NAME;
  const isObjectsDoc = document.type === 'objects-structure';
  if (!isFunctionDoc && !isObjectsDoc) return null;

  const extraModules = [...(params.extraModules ?? [])];
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
  // A document created but never edited has no stored root yet — the live editor falls back to the
  // node kind's factory default (`WorkflowStore.buildScheme`), so print the same.
  const root = document.root ?? scheme.infra.structure.factory(ROOT_NODE[document.type as DocumentType]);
  setRootNodeForScheme(scheme, createNodeStoreFromNode(root, scheme));
  return scheme;
};

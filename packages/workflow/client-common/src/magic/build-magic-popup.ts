import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  createNodeStoreFromNode,
  getNodeStoreDto,
  HistoryModule,
  setRootNodeForScheme,
  type ITheme,
  type Scheme,
} from '@falang/scheme';
import { collectScopeVariables } from '@falang/typescript-scheme';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import {
  buildMagicFunctionDocument,
  magicFunctionSchemeFactory,
  readMagicFunctionDocument,
} from '@falang/workflow-scheme';
import {
  createActivepiecesCatalogProvider,
  createActivepiecesFieldOptionsProvider,
  createFieldOptionsProvider,
} from '../integrations-document-helpers.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';

export interface IBuildMagicPopupParams {
  /** The scheme holding the magic node (the tab's main scheme). */
  readonly mainScheme: Scheme;
  readonly nodeId: string;
  readonly projectId: string;
  readonly container: DependencyContainer;
  readonly theme: ITheme;
  readonly getCredentialInstances: () => readonly IIntegrationInstance[];
  /** The user finished editing the popup header's spell. */
  readonly onHeaderSpellCommitted: (prev: string, next: string) => void;
}

/** A transient popup scheme for one magic node (ADR 0046 (private)) plus what OK needs from it. */
export interface IMagicPopup {
  readonly scheme: Scheme;
  /** The popup's current spell and steps (deep-cloned DTOs). */
  read(): { spell: string; children: INode[] };
  /** Whether the steps differ from when the popup was built (an edit-then-undo counts as no edit). */
  hasEdits(): boolean;
}

const stepsKey = (children: readonly INode[]): string => JSON.stringify(children);

/**
 * Builds the popup scheme for the magic node `nodeId` of `mainScheme`: root = `buildMagicFunctionDocument`
 * over the node's current DTO and the variables in scope at it (`collectScopeVariables`). Returns `null`
 * when the node no longer exists. The caller owns disposal (`scheme.dispose()`).
 */
export const buildMagicPopup = (params: IBuildMagicPopupParams): IMagicPopup | null => {
  const { mainScheme, nodeId, projectId, container, theme, getCredentialInstances } = params;
  const magicStore = mainScheme.nodes.getNodeSafe(nodeId);
  if (!magicStore) return null;
  const document = buildMagicFunctionDocument(
    getNodeStoreDto(magicStore, mainScheme),
    collectScopeVariables(magicStore),
  );
  const scheme = magicFunctionSchemeFactory({
    getActivepiecesCatalogProvider: () => createActivepiecesCatalogProvider(),
    getActivepiecesFieldOptionsProvider: () => createActivepiecesFieldOptionsProvider(projectId),
    getCredentialInstances,
    getFieldOptionsProvider: () => createFieldOptionsProvider(projectId),
    extraModules: [new HistoryModule()],
    id: `magic-${nodeId}`,
    integrations: REGISTERED_INTEGRATIONS,
    name: 'magic',
    onHeaderSpellCommitted: params.onHeaderSpellCommitted,
    parentContainer: container,
  });
  scheme.theme.setTheme(theme);
  setRootNodeForScheme(scheme, createNodeStoreFromNode(document, scheme));

  const read = (): { spell: string; children: INode[] } => {
    const root = scheme.rootNode;
    return root ? readMagicFunctionDocument(getNodeStoreDto(root, scheme)) : { children: [], spell: '' };
  };
  const baseline = stepsKey(read().children);
  return { hasEdits: () => stepsKey(read().children) !== baseline, read, scheme };
};

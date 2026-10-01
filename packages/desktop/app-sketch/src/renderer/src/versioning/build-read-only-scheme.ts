import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { createNodeStoreFromNode, setRootNodeForScheme, type IModule, type Scheme } from '@falang/scheme';
import { DOCUMENT_TYPES, type DocumentType } from '../desktop-project-store.js';

export interface IBuildReadOnlySchemeParams {
  readonly document: { readonly id: string; readonly name: string; readonly type: string; readonly root?: INode };
  readonly container: DependencyContainer;
  readonly extraModules?: IModule[];
}

/**
 * A read-only scheme for one document — the shared core of the version diff view's
 * (`build-read-only-scheme-for-diff.ts`) and the PDF print export's (ADR 0048 (private)) schemes.
 * Every `DocumentType` this app has is scheme-typed, so this only returns `null` for an unknown type.
 */
export const buildReadOnlyScheme = (params: IBuildReadOnlySchemeParams): Scheme | null => {
  const { document, container, extraModules } = params;
  const config = DOCUMENT_TYPES[document.type as DocumentType];
  if (!config) return null;
  const scheme = config.buildScheme({
    id: document.id,
    name: document.name,
    parentContainer: container,
    readOnly: true,
    extraModules: extraModules ?? [],
  });
  if (document.root) setRootNodeForScheme(scheme, createNodeStoreFromNode(document.root, scheme));
  return scheme;
};

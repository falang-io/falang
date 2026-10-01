import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { createNodeStoreFromNode, setRootNodeForScheme, type IModule, type Scheme } from '@falang/scheme';
import { arduinoSchemeFactory } from '../arduino-scheme-factory.js';
import { DEVICES_DOCUMENT_TYPE } from '../../../shared/devices-document.js';

export interface IBuildReadOnlySchemeParams {
  readonly document: { readonly id: string; readonly name: string; readonly type: string; readonly root?: INode };
  readonly container: DependencyContainer;
  readonly extraModules?: IModule[];
}

/**
 * A read-only scheme for one document — the shared core of the version diff view's
 * (`build-read-only-scheme-for-diff.ts`) and the PDF print export's (ADR 0048 (private)) schemes.
 * Every `function` document goes through `arduinoSchemeFactory` (same pin/driver icon groups a live
 * scheme gets); the `devices` document has no node tree at all, so it returns `null`.
 */
export const buildReadOnlyScheme = (params: IBuildReadOnlySchemeParams): Scheme | null => {
  const { document, container, extraModules } = params;
  if (document.type === DEVICES_DOCUMENT_TYPE) return null;
  const scheme = arduinoSchemeFactory({
    id: document.id,
    name: document.name,
    parentContainer: container,
    readOnly: true,
    extraModules: extraModules ?? [],
  });
  if (document.root) setRootNodeForScheme(scheme, createNodeStoreFromNode(document.root, scheme));
  return scheme;
};

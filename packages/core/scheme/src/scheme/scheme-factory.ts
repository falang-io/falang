import type { DependencyContainer } from '@falang/di';
import { container as diContainer, Lifecycle, resolveService } from '@falang/di';
import type { ISchemeConstructorParams } from './scheme.js';
import { Scheme } from './scheme.js';
import { TOKEN_CSS_CLASSES, TOKEN_I18N, TOKEN_SCHEME, TOKEN_SELECTION } from '../di-tokens.js';
import { CssClassesStore } from '../store/css-classes.store.js';
import type { IProjectDocument } from '@falang/dto';
import { createNodeStoreFromNode } from '../utils/create-node-store-from-node.js';
import { runInAction } from 'mobx';
import { syncIcon } from '../utils/sync-icon.js';
import { SelectionStore } from '../store/selection.store.js';
import { registerSchemeCommands } from './register-scheme-commands.js';
import { I18NStore } from '../store/i18n.store.js';
import type { NodeStore } from '../store/node.store.js';

const registerBaseTokens = (scheme: Scheme) => {
  scheme.container.register(TOKEN_CSS_CLASSES, CssClassesStore, {
    lifecycle: Lifecycle.ContainerScoped,
  });
  scheme.container.register(TOKEN_SELECTION, SelectionStore, {
    lifecycle: Lifecycle.ContainerScoped,
  });
  scheme.container.registerInstance(TOKEN_SCHEME, scheme);
};

let globalTokensRegistered = false;
export const registerGlobalTokens = () => {
  if (globalTokensRegistered) return;
  globalTokensRegistered = true;
  diContainer.register(TOKEN_I18N, I18NStore, {
    lifecycle: Lifecycle.Singleton,
  });
};

// The one shared `I18NStore` instance for the whole process — usable before any `Scheme`/document
// exists (e.g. an app-chrome language switcher), since it doesn't depend on a `schemeFactory()` call.
export const getGlobalI18n = (): I18NStore => {
  registerGlobalTokens();
  return resolveService(TOKEN_I18N, diContainer);
};

export interface ISchemeFactoryParams extends Omit<ISchemeConstructorParams, 'container'> {
  document?: IProjectDocument;
  parentContainer?: DependencyContainer;
}

export const schemeFactory = (params: ISchemeFactoryParams): Scheme => {
  const container = params.parentContainer?.createChildContainer() ?? diContainer.createChildContainer();
  const scheme = new Scheme({
    ...params,
    container,
  });
  if (params.document) {
    const doc = scheme.infra.structure.parseDocument(params.document);
    if (!doc.root) throw new Error('schemeFactory: document has no root node');
    const nodeStore = createNodeStoreFromNode(doc.root, scheme);
    runInAction(() => {
      scheme.rootNode = nodeStore;
    });
    runInAction(() => {
      syncIcon(nodeStore.id, scheme);
    });
  }
  registerBaseTokens(scheme);
  registerGlobalTokens();
  scheme.registerModules();
  scheme.initializeModules();
  registerSchemeCommands(scheme);
  return scheme;
};

export const setRootNodeForScheme = (scheme: Scheme, nodeStore: NodeStore) => {
  runInAction(() => {
    scheme.rootNode = nodeStore;
  });
  runInAction(() => {
    syncIcon(nodeStore.id, scheme);
  });
};

import type { DependencyContainer } from '@falang/di';
import { Lifecycle } from '@falang/di';
import { ProjectDocumentsRegistryStore } from './project-documents-registry.store.js';
import { TOKEN_PROJECT_DOCUMENTS_REGISTRY } from './project-documents-registry.token.js';

export const registerProjectDocumentsRegistry = (container: DependencyContainer) => {
  container.register(TOKEN_PROJECT_DOCUMENTS_REGISTRY, ProjectDocumentsRegistryStore, {
    lifecycle: Lifecycle.Singleton,
  });
};

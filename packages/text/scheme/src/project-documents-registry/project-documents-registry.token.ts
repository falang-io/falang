import { createSchemeToken } from '@falang/di';
import type { ProjectDocumentsRegistryStore } from './project-documents-registry.store.js';

export const TOKEN_PROJECT_DOCUMENTS_REGISTRY =
  createSchemeToken<ProjectDocumentsRegistryStore>('PROJECT_DOCUMENTS_REGISTRY');

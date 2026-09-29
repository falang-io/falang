import type { IIntegrationInstance, IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import type {
  IActivepiecesCatalogProvider,
  IActivepiecesFieldOptionsProvider,
  IFieldOptionsProvider,
} from '@falang/workflow-scheme';
import { workflowApi } from './api-client.js';
import { findIntegrationsDocument, getIntegrationsData } from './integration-instances.js';
import type { ProjectSync } from './project-sync.js';
import type { WorkflowDocument } from './workflow-types.js';

export { findIntegrationsDocument, getIntegrationInstances } from './integration-instances.js';

export const saveIntegrationInstanceAction = (
  documents: readonly WorkflowDocument[],
  sync: ProjectSync,
  instance: IIntegrationInstance,
): void => {
  const doc = findIntegrationsDocument(documents);
  if (!doc) return;
  const instances = getIntegrationsData(doc).instances.filter((item) => item.id !== instance.id);
  doc.customData = { instances: [...instances, instance] } satisfies IIntegrationsDocumentData;
  sync.scheduleSaveCustomDocument(doc);
};

export const deleteIntegrationInstanceAction = (
  documents: readonly WorkflowDocument[],
  sync: ProjectSync,
  id: string,
): void => {
  const doc = findIntegrationsDocument(documents);
  if (!doc) return;
  const instances = getIntegrationsData(doc).instances.filter((item) => item.id !== id);
  doc.customData = { instances } satisfies IIntegrationsDocumentData;
  sync.scheduleSaveCustomDocument(doc);
};

/** `IntegrationsModule`'s `TOKEN_FIELD_OPTIONS_PROVIDER` — see `WorkflowStore.buildScheme`. */
export const createFieldOptionsProvider = (projectId: string): IFieldOptionsProvider => ({
  loadOptions: (_vendor, credentialId, actionName, fieldName) =>
    workflowApi.loadIntegrationFieldOptions(projectId, credentialId, actionName, fieldName),
});

/** `IntegrationsModule`'s `TOKEN_ACTIVEPIECES_CATALOG_PROVIDER` — see `WorkflowStore.buildScheme`. Not project-scoped. */
export const createActivepiecesCatalogProvider = (): IActivepiecesCatalogProvider => ({
  getPieces: () => workflowApi.loadActivepiecesPieces(),
});

/** `IntegrationsModule`'s `TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER` — see `WorkflowStore.buildScheme`. */
export const createActivepiecesFieldOptionsProvider = (projectId: string): IActivepiecesFieldOptionsProvider => ({
  loadOptions: (credentialId, pieceName, actionName, fieldName, propsValue) =>
    workflowApi.loadActivepiecesFieldOptions(projectId, credentialId, pieceName, actionName, fieldName, propsValue),
});

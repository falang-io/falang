import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import type { WorkflowDocument } from './workflow-types.js';

/**
 * Pure, read-only access to the `integrations` document's instances — split out of
 * `integrations-document-helpers.ts` (which re-exports these) so a consumer that only needs to *read*
 * instances (e.g. `DocumentToolProvider`/`IntegrationToolProvider`, ADR 0034 §4/§5) doesn't have to
 * import `./api-client.js` transitively through that file — `api-client.ts` reads `localStorage` at
 * module scope, which breaks importing it (even just for its types) in this package's plain-node
 * Vitest environment (no jsdom).
 */
export const findIntegrationsDocument = (documents: readonly WorkflowDocument[]): WorkflowDocument | undefined =>
  documents.find((d) => d.type === INTEGRATIONS_DOCUMENT_TYPE);

export const getIntegrationsData = (doc: WorkflowDocument | undefined): IIntegrationsDocumentData => {
  const raw = doc?.customData;
  return raw ? (raw as IIntegrationsDocumentData) : { instances: [] };
};

/** Read access for `IntegrationsModule`'s `ICredentialsProvider` — see `WorkflowStore.buildScheme`. */
export const getIntegrationInstances = (documents: readonly WorkflowDocument[]): readonly IIntegrationInstance[] =>
  getIntegrationsData(findIntegrationsDocument(documents)).instances;

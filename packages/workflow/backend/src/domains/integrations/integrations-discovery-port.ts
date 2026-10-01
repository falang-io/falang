import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { IIntegrationCredentialInstance, IIntegrationsDiscoveryPort } from '@falang/workflow-gateway';
import type { Repository } from 'typeorm';
import type { Document } from '../projects/documents/document.entity.js';
import type { Project } from '../projects/projects/project.entity.js';
import { resolveFieldValue } from './credentials-codec.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';

// Must match `BuildService`'s `devTaskQueue`/`prodTaskQueue` naming exactly — see
// ADR 0002 (private).
const devTaskQueue = (projectId: string): string => `workflow-dev-${projectId}`;
const prodTaskQueue = (projectId: string): string => `workflow-${projectId}`;

const findInstance = async (
  documents: Repository<Document>,
  vendor: string,
  instanceId: string,
  projectId: string,
): Promise<IIntegrationInstance | undefined> => {
  const integrationsDocuments = await documents.find({ where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId } });
  for (const document of integrationsDocuments) {
    const data = document.data as IIntegrationsDocumentData | null;
    const instance = data?.instances.find((candidate) => candidate.id === instanceId && candidate.vendor === vendor);
    if (instance) return instance;
  }
};

/**
 * TypeORM-backed implementation of `@falang/workflow-gateway`'s `IIntegrationsDiscoveryPort` — the
 * only place `@falang/workflow-gateway`'s `IntegrationsRuntimeService` reaches into this app's
 * `Document` entity/credential encryption. See ADR 0006 and
 * ADR 0002 (private)'s package-boundary rationale.
 */
export const createIntegrationsDiscoveryPort = (
  documents: Repository<Document>,
  encryptionKey: Buffer,
  /**
   * Backs `listProjectIds()` — see ADR 0037 (private) §4's implicit-target rule,
   * which needs to know every project that exists (not just ones with a configured credential instance).
   */
  projects: Repository<Project>,
  /**
   * Resolves vendors known only at Nest bootstrap time (ActivePieces pieces — see
   * ADR 0011 (private)), consulted only when `vendor` isn't found in the
   * static `REGISTERED_INTEGRATIONS`. Called per lookup rather than once up front, matching how every
   * other consumer of `ActivepiecesCatalogService` already resolves it at request/call time (it
   * caches internally, so this doesn't mean a fresh fetch per call).
   */
  getDynamicIntegrations: () => Promise<readonly IWorkflowIntegration[]>,
): IIntegrationsDiscoveryPort => ({
  findCredentialInstances: async (): Promise<readonly IIntegrationCredentialInstance[]> => {
    const integrationsDocuments = await documents.find({ where: { type: INTEGRATIONS_DOCUMENT_TYPE } });
    const instances: IIntegrationCredentialInstance[] = [];
    for (const document of integrationsDocuments) {
      const data = document.data as IIntegrationsDocumentData | null;
      for (const instance of data?.instances ?? []) {
        instances.push({ instanceId: instance.id, vendor: instance.vendor, projectId: document.projectId });
      }
    }
    return instances;
  },

  resolveCredentialFields: async (vendor, instanceId, env, projectId) => {
    const staticMatch = REGISTERED_INTEGRATIONS.find((candidate) => candidate.vendor === vendor);
    const dynamicIntegrations = staticMatch ? [] : await getDynamicIntegrations();
    const integration = staticMatch ?? dynamicIntegrations.find((candidate) => candidate.vendor === vendor);
    if (!integration) return;
    const instance = await findInstance(documents, vendor, instanceId, projectId);
    if (!instance) return;

    const secretFields = integration.credentialFields.filter((field) => field.kind === 'secret');
    const resolved: Record<string, string> = {};
    for (const field of integration.credentialFields) {
      resolved[field.name] = resolveFieldValue(instance, field, env, encryptionKey) ?? '';
    }
    // No secret fields at all means "always configured" (nothing to gate on); otherwise at least one
    // secret must have a value for this env, or the instance isn't meaningfully configured for it yet.
    const configured = secretFields.length === 0 || secretFields.some((field) => resolved[field.name]);
    if (!configured) return;
    return resolved;
  },

  getDocumentsByType: async (projectId, type) => {
    const docs = await documents.find({ where: { projectId, type } });
    return docs.map((document) => ({ id: document.id, name: document.name, data: document.data, root: document.root }));
  },

  taskQueueFor: (projectId, env) => (env === 'dev' ? devTaskQueue(projectId) : prodTaskQueue(projectId)),

  listProjectIds: async (): Promise<readonly string[]> => {
    const rows = await projects.find({ select: { id: true } });
    return rows.map((row) => row.id);
  },
});

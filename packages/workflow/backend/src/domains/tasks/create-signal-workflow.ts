import type { ITemporalTenancy } from '@falang/workflow-gateway';
import type { TSignalWorkflow } from './tasks.service.js';

/**
 * The real `TSignalWorkflow`: a plain signal on the known `(workflowId, runId)`, sent through the client
 * of the project's own Temporal namespace (ADR 0050 (private)) over the shared, never-closed connection.
 * Reads the namespace without registering it — a run being signalled necessarily lives in an existing one.
 */
export const createSignalWorkflow =
  (tenancy: Pick<ITemporalTenancy, 'namespaceFor' | 'getClientForNamespace'>): TSignalWorkflow =>
  async (projectId, workflowId, runId, signalName, payload) => {
    const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
    await client.workflow.getHandle(workflowId, runId).signal(signalName, payload);
  };

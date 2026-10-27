import { isNamespaceNotFoundError, type ITemporalTenancy } from '@falang/workflow-gateway';
import { WorkflowNotFoundError } from '@temporalio/client';
import type { TDescribeWorkflow, TSignalWorkflow } from './tasks.service.js';

/**
 * The real `TSignalWorkflow`: a plain signal on the known `(workflowId, runId)`, sent through the client
 * of the project's own Temporal namespace (ADR 0057 (private)) over the shared, never-closed connection.
 * Reads the namespace without registering it — a run being signalled necessarily lives in an existing one.
 */
export const createSignalWorkflow =
  (tenancy: Pick<ITemporalTenancy, 'namespaceFor' | 'getClientForNamespace'>): TSignalWorkflow =>
  async (projectId, workflowId, runId, signalName, payload) => {
    const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
    await client.workflow.getHandle(workflowId, runId).signal(signalName, payload);
  };

/**
 * The real `TDescribeWorkflow`: asks the project's own namespace which task queue the run lives on, or
 * `null` when no such run exists there (security audit P1-11).
 */
export const createDescribeWorkflow =
  (tenancy: Pick<ITemporalTenancy, 'namespaceFor' | 'getClientForNamespace'>): TDescribeWorkflow =>
  async (projectId, workflowId, runId) => {
    try {
      const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
      const description = await client.workflow.getHandle(workflowId, runId).describe();
      return { taskQueue: description.taskQueue };
    } catch (error) {
      if (error instanceof WorkflowNotFoundError || isNamespaceNotFoundError(error)) return null;
      throw error;
    }
  };

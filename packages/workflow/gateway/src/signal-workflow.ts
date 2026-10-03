import type { ITemporalTenancy } from './temporal-tenancy.js';

export interface ISignalWorkflowWithStartParams {
  readonly taskQueue: string;
  readonly workflowId: string;
  readonly workflowType: string;
  readonly signalName: string;
  readonly signalArgs: readonly unknown[];
  /** Resolves the namespace (and the client) through `ITemporalTenancy` — see ADR 0057 (private). */
  readonly projectId: string;
}

/**
 * Atomically signals a running workflow execution, or starts a new one and delivers the signal as its
 * first event if none is running under `workflowId` yet — see
 * ADR 0006 (private)'s "Runtime dialog continuation" section.
 * Every inbound vendor event (first message or a conversation continuation) goes through this same
 * call; which published version actually handles it is resolved by Temporal itself (shared task queue
 * + PINNED versioning, see ADR 0004) — this function never needs to know or choose a version.
 *
 * A plain injected function, not a class wrapping `@temporalio/client` directly, so
 * `WebhookGatewayService`'s business logic has no direct dependency on the Temporal SDK — mirrors
 * `@falang/workflow-backend`'s `TStartAndAwaitWorkflow` (see `workflow-run.service.ts`); the real
 * implementation lives in `gateway.module.ts`.
 */
export type TSignalWorkflowWithStart = (params: ISignalWorkflowWithStartParams) => Promise<void>;

/**
 * The real `TSignalWorkflowWithStart`: resolves the project's namespace and a pooled, authenticated
 * client through `ITemporalTenancy` (ADR 0057 (private)) — the shared connection is never closed per call.
 */
export const createSignalWorkflowWithStart =
  (tenancy: ITemporalTenancy): TSignalWorkflowWithStart =>
  async ({ signalArgs, signalName, taskQueue, projectId, workflowId, workflowType }) => {
    const client = await tenancy.getClient(projectId);
    await client.workflow.signalWithStart(workflowType, {
      workflowId,
      taskQueue,
      signal: signalName,
      signalArgs: [...signalArgs],
      args: [],
    });
  };

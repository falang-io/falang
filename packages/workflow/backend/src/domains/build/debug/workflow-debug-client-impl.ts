import type { ITemporalTenancy } from '@falang/workflow-gateway';
import { DEBUG_CONFIGURE_SIGNAL_NAME, DEBUG_STATE_QUERY_NAME, type IDebugQueryState } from '@falang/workflow-compiler';
import { WorkflowNotFoundError } from '@temporalio/client';
import { temporal } from '@temporalio/proto';
import type { DocumentsService } from '../../projects/documents/documents.service.js';
import type { BuildService } from '../build/build.service.js';
import type { DevArtifactStore } from '../build/dev-artifact-store.service.js';
import { readFailureMessage } from '../build/workflow-position.js';
import type { WorkflowRunService } from '../build/workflow-run.service.js';
import { DebugService } from './debug.service.js';
import type {
  TDebugSignalWithStart,
  TDescribeDebugWorkflow,
  TQueryDebugState,
  TSendDebugSignal,
  TTerminateDebugWorkflow,
} from './workflow-debug-client.js';

/** The real `@temporalio/client`-backed implementations `DebugService` is constructed with — pulled into its own file purely to keep `build.module.ts` under its line cap, the same way `k8s-deployments-client.ts` externalizes `RunnerProcessManager`'s k8s client construction. */

/** Same reasoning as `build.module.ts`'s own `POSITION_QUERY_DEADLINE_MS` — the client polls debug state every 500ms (ADR 0021 (private) §5), so this stays short. */
const DEBUG_QUERY_DEADLINE_MS = 3000;

// Every call resolves the project's own namespace client through `ITemporalTenancy` (a shared, pooled
// connection that is never closed here) — ADR 0057 (private).
const createDebugClient = (tenancy: ITemporalTenancy) => {
  const signalWithStartDebug: TDebugSignalWithStart = async ({
    projectId,
    taskQueue,
    workflowId,
    functionName,
    args,
    breakpoints,
    pauseOnEntry,
    followUpSignal,
  }) => {
    const client = await tenancy.getClient(projectId);
    const handle = await client.workflow.signalWithStart(functionName, {
      workflowId,
      taskQueue,
      args: [...args],
      signal: DEBUG_CONFIGURE_SIGNAL_NAME,
      signalArgs: [{ breakpoints: [...breakpoints], pauseOnEntry }],
    });
    if (followUpSignal) await handle.signal(followUpSignal.name, ...followUpSignal.args);
    return { runId: handle.signaledRunId };
  };

  const sendDebugSignal: TSendDebugSignal = async ({ projectId, workflowId, signalName, signalArgs }) => {
    const client = await tenancy.getClient(projectId);
    await client.workflow.getHandle(workflowId).signal(signalName, ...signalArgs);
  };

  const describeDebugWorkflow: TDescribeDebugWorkflow = async ({ projectId, workflowId }) => {
    const client = await tenancy.getClient(projectId);
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe().catch((error: unknown) => {
      if (error instanceof WorkflowNotFoundError) return null;
      throw error;
    });
    if (!description) return null;
    const base = { status: description.status.name, taskQueue: description.taskQueue };
    if (description.status.name !== 'FAILED') return base;

    const history = await handle.fetchHistory();
    const failure = history.events?.find(
      (event) => event.eventType === temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
    )?.workflowExecutionFailedEventAttributes?.failure;
    const failureMessage = readFailureMessage(failure);
    return failureMessage === null ? base : { ...base, failureMessage };
  };

  const queryDebugState: TQueryDebugState = async ({ projectId, workflowId }) => {
    const client = await tenancy.getClient(projectId);
    const handle = client.workflow.getHandle(workflowId);
    try {
      return await client.connection.withDeadline(Date.now() + DEBUG_QUERY_DEADLINE_MS, () =>
        handle.query<IDebugQueryState>(DEBUG_STATE_QUERY_NAME),
      );
    } catch {
      return 'unavailable';
    }
  };

  const terminateDebugWorkflow: TTerminateDebugWorkflow = async ({ projectId, workflowId }) => {
    const client = await tenancy.getClient(projectId);
    await client.workflow.getHandle(workflowId).terminate('debug session stopped');
  };

  return { signalWithStartDebug, sendDebugSignal, describeDebugWorkflow, queryDebugState, terminateDebugWorkflow };
};

/** `build.module.ts`'s `DebugService` factory provider body, pulled out here purely to keep that file under its line cap — `buildService.ensureRunnerDeps()` is reused verbatim (a debug session's `ensureRunnerRunning` call is always `env: 'dev'`, see that method's own doc comment). */
export const createDebugService = (
  documentsService: DocumentsService,
  devArtifacts: DevArtifactStore,
  workflowRunService: WorkflowRunService,
  buildService: BuildService,
  tenancy: ITemporalTenancy,
): DebugService =>
  new DebugService({
    documentsService,
    devArtifacts,
    workflowRunService,
    ensureRunnerDeps: buildService.ensureRunnerDeps(),
    resolveRunEntry: (projectId, ownerId, input) => buildService.resolveRunEntry(projectId, ownerId, input),
    ...createDebugClient(tenancy),
  });

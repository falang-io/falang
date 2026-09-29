import type { ConfigService } from '@nestjs/config';
import { DEBUG_CONFIGURE_SIGNAL_NAME, DEBUG_STATE_QUERY_NAME, type IDebugQueryState } from '@falang/workflow-compiler';
import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
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

const connect = (temporalAddress: string | undefined): Promise<Connection> =>
  temporalAddress ? Connection.connect({ address: temporalAddress }) : Connection.connect();

// Connects fresh per call, same posture as every other Temporal-touching function in this domain —
// a debug session is a single developer clicking buttons, not a hot path.
export const signalWithStartDebug: TDebugSignalWithStart = async ({
  taskQueue,
  workflowId,
  functionName,
  args,
  breakpoints,
  pauseOnEntry,
  temporalAddress,
  namespace,
}) => {
  const connection = await connect(temporalAddress);
  try {
    const client = new Client({ connection, namespace });
    const handle = await client.workflow.signalWithStart(functionName, {
      workflowId,
      taskQueue,
      args: [...args],
      signal: DEBUG_CONFIGURE_SIGNAL_NAME,
      signalArgs: [{ breakpoints: [...breakpoints], pauseOnEntry }],
    });
    return { runId: handle.signaledRunId };
  } finally {
    await connection.close();
  }
};

export const sendDebugSignal: TSendDebugSignal = async ({ workflowId, signalName, signalArgs, temporalAddress, namespace }) => {
  const connection = await connect(temporalAddress);
  try {
    const client = new Client({ connection, namespace });
    await client.workflow.getHandle(workflowId).signal(signalName, ...signalArgs);
  } finally {
    await connection.close();
  }
};

export const describeDebugWorkflow: TDescribeDebugWorkflow = async ({ workflowId, temporalAddress, namespace }) => {
  const connection = await connect(temporalAddress);
  try {
    const client = new Client({ connection, namespace });
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
  } finally {
    await connection.close();
  }
};

export const queryDebugState: TQueryDebugState = async ({ workflowId, temporalAddress, namespace }) => {
  const connection = await connect(temporalAddress);
  try {
    const client = new Client({ connection, namespace });
    const handle = client.workflow.getHandle(workflowId);
    try {
      return await connection.withDeadline(Date.now() + DEBUG_QUERY_DEADLINE_MS, () =>
        handle.query<IDebugQueryState>(DEBUG_STATE_QUERY_NAME),
      );
    } catch {
      return 'unavailable';
    }
  } finally {
    await connection.close();
  }
};

export const terminateDebugWorkflow: TTerminateDebugWorkflow = async ({ workflowId, temporalAddress, namespace }) => {
  const connection = await connect(temporalAddress);
  try {
    const client = new Client({ connection, namespace });
    await client.workflow.getHandle(workflowId).terminate('debug session stopped');
  } finally {
    await connection.close();
  }
};

/** `build.module.ts`'s `DebugService` factory provider body, pulled out here purely to keep that file under its line cap — `buildService.ensureRunnerDeps()` is reused verbatim (a debug session's `ensureRunnerRunning` call is always `env: 'dev'`, see that method's own doc comment). */
export const createDebugService = (
  documentsService: DocumentsService,
  devArtifacts: DevArtifactStore,
  workflowRunService: WorkflowRunService,
  buildService: BuildService,
  config: ConfigService,
): DebugService =>
  new DebugService({
    documentsService,
    devArtifacts,
    workflowRunService,
    ensureRunnerDeps: buildService.ensureRunnerDeps(),
    signalWithStartDebug,
    sendDebugSignal,
    describeDebugWorkflow,
    queryDebugState,
    terminateDebugWorkflow,
    temporalAddress: config.get<string>('TEMPORAL_ADDRESS'),
    namespace: config.get<string>('TEMPORAL_NAMESPACE'),
  });

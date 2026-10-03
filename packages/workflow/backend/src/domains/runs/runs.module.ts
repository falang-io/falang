import { Module } from '@nestjs/common';
import { TEMPORAL_TENANCY, isNamespaceNotFoundError, type ITemporalTenancy } from '@falang/workflow-gateway';
import { WorkflowNotFoundError } from '@temporalio/client';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { arrayFromPayloads, defaultPayloadConverter } from '@temporalio/common';
import { temporal } from '@temporalio/proto';
import type { Repository } from 'typeorm';
import { ProjectVersion } from '../build/build/project-version.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { ProjectRunsController } from './project-runs.controller.js';
import { RunsController } from './runs.controller.js';
import {
  RunsService,
  type IRawWorkflowRun,
  type IRawWorkflowRunDetail,
  type IWorkflowRunEvent,
  type TDescribeWorkflowRun,
  type TListWorkflowRuns,
  type TTerminateWorkflowRun,
} from './runs.service.js';

type TEventType = temporal.api.enums.v1.EventType;
type TPayloads = temporal.api.common.v1.IPayloads | null | undefined;
type TTimestamp = { readonly seconds?: unknown; readonly nanos?: number | null } | null | undefined;

// A single page comfortably covers the MVP's expected volume (a handful of projects, each with a
// modest number of runs) without needing real cursor-based pagination on the client.
const LIST_LIMIT = 300;

// protobufjs decodes 64-bit proto fields (eventId, timestamp seconds) as `Long` instances, not
// plain numbers — duck-typed here rather than importing the `long` package directly, since neither
// this package nor `@temporalio/client` declares it as a direct dependency.
const longToNumber = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

const timestampToIso = (ts: TTimestamp): string | null => {
  if (!ts?.seconds) return null;
  const millis = longToNumber(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
  return new Date(millis).toISOString();
};

// Bracket-indexing with a nullish key simply yields `undefined` in JS, so this needs no
// null/undefined check of its own — `eventType` is cast only to satisfy the enum's numeric index signature.
const eventTypeName = (eventType: TEventType | null | undefined): string =>
  temporal.api.enums.v1.EventType[eventType as TEventType] || 'UNKNOWN';

const decodePayloads = (payloads: TPayloads): unknown => {
  if (!payloads?.payloads || payloads.payloads.length === 0) return null;
  const values = arrayFromPayloads(defaultPayloadConverter, payloads.payloads);
  return values.length === 1 ? values[0] : values;
};

// `taskQueues` is always built from this project's own UUID project ids (see `RunsService.listRuns`
// — never a client-supplied string), so embedding them directly in the visibility query is safe, the
// same reasoning `BuildModule`'s `terminateRunningExecutions` already relies on. Reads never register a
// namespace (`getClientForNamespace`): a project that never ran anything simply has none yet.
const createListWorkflowRuns =
  (tenancy: ITemporalTenancy): TListWorkflowRuns =>
  async ({ projectId, taskQueues }) => {
    if (taskQueues.length === 0) return [];
    try {
      const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
      const query = `TaskQueue IN (${taskQueues.map((queue) => `'${queue}'`).join(', ')})`;
      const runs: IRawWorkflowRun[] = [];
      for await (const execution of client.workflow.list({ query })) {
        runs.push({
          workflowId: execution.workflowId,
          runId: execution.runId,
          status: execution.status.name,
          workflowName: execution.type,
          taskQueue: execution.taskQueue,
          buildId: execution.raw.versioningInfo?.deploymentVersion?.buildId ?? null,
          startTime: execution.startTime.toISOString(),
          closeTime: execution.closeTime ? execution.closeTime.toISOString() : null,
        });
        if (runs.length >= LIST_LIMIT) break;
      }
      return runs;
    } catch (error) {
      if (isNamespaceNotFoundError(error)) return [];
      throw error;
    }
  };

const createDescribeWorkflowRun =
  (tenancy: ITemporalTenancy): TDescribeWorkflowRun =>
  async ({ projectId, workflowId, runId }) => {
    try {
      const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
      const handle = client.workflow.getHandle(workflowId, runId);
      const [description, history] = await Promise.all([handle.describe(), handle.fetchHistory()]);

      const events: IWorkflowRunEvent[] = (history.events ?? []).map((event) => ({
        id: String(longToNumber(event.eventId)),
        time: timestampToIso(event.eventTime),
        type: eventTypeName(event.eventType),
      }));

      const startedEvent = history.events?.find(
        (event) => event.eventType === temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
      );
      const completedEvent = history.events?.find(
        (event) => event.eventType === temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
      );

      const detail: IRawWorkflowRunDetail = {
        workflowId: description.workflowId,
        runId: description.runId,
        status: description.status.name,
        workflowName: description.type,
        taskQueue: description.taskQueue,
        buildId: description.raw.workflowExecutionInfo?.versioningInfo?.deploymentVersion?.buildId ?? null,
        startTime: description.startTime.toISOString(),
        closeTime: description.closeTime ? description.closeTime.toISOString() : null,
        input: decodePayloads(startedEvent?.workflowExecutionStartedEventAttributes?.input),
        result: decodePayloads(completedEvent?.workflowExecutionCompletedEventAttributes?.result),
        events,
      };
      return detail;
    } catch (error) {
      if (error instanceof WorkflowNotFoundError || isNamespaceNotFoundError(error)) return null;
      throw error;
    }
  };

const createTerminateWorkflowRun =
  (tenancy: ITemporalTenancy): TTerminateWorkflowRun =>
  async ({ projectId, workflowId, runId, reason }) => {
    const client = await tenancy.getClientForNamespace(tenancy.namespaceFor(projectId));
    await client.workflow.getHandle(workflowId, runId).terminate(reason);
  };

@Module({
  imports: [ProjectsModule, TypeOrmModule.forFeature([ProjectVersion])],
  controllers: [RunsController, ProjectRunsController],
  providers: [
    {
      provide: RunsService,
      inject: [ProjectsService, getRepositoryToken(ProjectVersion), TEMPORAL_TENANCY],
      useFactory: (projectsService: ProjectsService, versions: Repository<ProjectVersion>, tenancy: ITemporalTenancy) =>
        new RunsService({
          projectsService,
          versions,
          listWorkflowRuns: createListWorkflowRuns(tenancy),
          describeWorkflowRun: createDescribeWorkflowRun(tenancy),
          terminateWorkflowRun: createTerminateWorkflowRun(tenancy),
          tenancy,
        }),
    },
  ],
  // Consumed directly by `McpModule` (ADR 0029 (private) phase F).
  exports: [RunsService],
})
export class RunsModule {}

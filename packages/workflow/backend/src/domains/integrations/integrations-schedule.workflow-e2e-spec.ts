import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { scheduleIntegration } from '@falang/workflow-integrations-schedule';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eAwaitWorkflowResult,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildLogNode } from '../../test-utils/workflow-e2e-fixtures.js';
import type { IApiSchedule } from '../build/build/api-schedule.js';
import type { IStartedDevRun } from '../build/build/build.service.js';

/**
 * Workflow-tier spec for ADR 0037 (private)'s Temporal-Schedule-backed timer
 * triggers (`schedule-interval`/`schedule-cron`), mirroring `integrations-webhook.workflow-e2e-spec.ts`'s
 * shape: a `trigger-function` document imported via `POST /projects/import`, built for real against the
 * `falang-workflow-e2e` `kind` stack, and asserted against through the real backend HTTP surface — no
 * browser, see ADR 0018 (private).
 *
 * `schedule` is a credential-less vendor (`credentialFields: []`, see `scheduleIntegration`'s own doc
 * comment and `IntegrationsRuntimeService.discoverImplicitTargets`) — a project gets an *implicit*
 * target (`credentialId` equal to the vendor id, `'schedule'`) for free, once its dev runner is active,
 * with no `integrations` document instance needed at all. The fixtures below therefore omit the
 * `integrations` document entirely (same as `build-and-run.workflow-e2e-spec.ts`'s
 * `buildSingleFunctionFixture`) and hand-build each `trigger-function` root directly — unlike the
 * webhook spec's `buildTriggerFunctionRootNode` helper (`test-utils/workflow-e2e-fixtures.ts`), which
 * has no `triggerConfig` parameter (schedule triggers are the first/only ones that need it), a local
 * `buildScheduleTriggerFunctionRootNode` below builds the same shape plus that field rather than
 * modifying the shared helper (out of scope for this file, see its own task description).
 *
 * Timing budget assumed here, both read from the real backend sources: `IntegrationsRuntimeService`'s
 * discovery tick is `DISCOVERY_INTERVAL_MS = 30_000` (`packages/workflow/gateway/src/
 * integrations-runtime.service.ts`) — this is what activates a project's implicit `schedule` target
 * once its dev runner starts, and what (re)registers `registerScheduleBackend` for it; and
 * `registerScheduleBackend`'s own reconcile tick is `RECONCILE_INTERVAL_MS = 30_000`
 * (`packages/workflow-integrations/schedule/src/schedule-backend.ts`), though its first `reconcile()`
 * runs synchronously as soon as the backend is registered (no need to wait a full tick for the very
 * first upsert). A 60s poll budget for "the schedule now exists" covers one worst-case discovery tick
 * plus margin; a further 60s budget for "it has fired at least twice" covers that same activation lag
 * plus the interval trigger's own 2-second period (several fires easily land inside 60s once active).
 */
describe('integrations (workflow tier): Schedule', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const findDocumentIdByName = async (projectId: string, name: string): Promise<string> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
    const document = (response.body as readonly { id: string; name: string }[]).find((doc) => doc.name === name);
    if (!document) throw new Error(`No document named "${name}" in project ${projectId}`);
    return document.id;
  };

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const listSchedules = async (projectId: string): Promise<IApiSchedule[]> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/schedules`).set(workflowE2eAuth(token));
    return response.body as IApiSchedule[];
  };

  const listWorkflowRuns = async (projectId: string): Promise<readonly { readonly workflowId: string }[]> => {
    const response = await workflowE2eApi().get('/workflow-runs').query({ projectId }).set(workflowE2eAuth(token));
    return response.body as readonly { readonly workflowId: string }[];
  };

  /**
   * Mirrors `test-utils/workflow-e2e-fixtures.ts`'s `buildTriggerFunctionRootNode` exactly, plus a
   * `triggerConfig` field that helper doesn't expose (see this file's own doc comment on why it's
   * reimplemented here rather than there).
   */
  const buildScheduleTriggerFunctionRootNode = (
    id: string,
    fields: {
      readonly triggerName: string;
      readonly credentialId: string;
      readonly triggerConfig: Readonly<Record<string, string>>;
      readonly scopeVariableName: string;
      readonly scopeType: TVariableInfo;
    },
    bodyChildren: readonly INode[],
  ): INode => ({
    id,
    name: 'trigger-function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'trigger-function-body',
        data: {
          vendor: scheduleIntegration.vendor,
          triggerName: fields.triggerName,
          credentialId: fields.credentialId,
          scopeVariableName: fields.scopeVariableName,
          scopeType: fields.scopeType,
          triggerConfig: fields.triggerConfig,
        },
        children: [...bodyChildren],
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  });

  const buildScheduleFixture = (
    projectName: string,
    functionName: string,
    triggerName: string,
    triggerConfig: Readonly<Record<string, string>>,
  ): IProjectExportPayload => {
    const trigger = scheduleIntegration.triggers.find((candidate) => candidate.name === triggerName);
    if (!trigger) throw new Error(`No trigger named "${triggerName}" on the schedule vendor`);
    return {
      formatVersion: 1,
      project: { id: '', name: projectName },
      folders: [],
      documents: [
        {
          id: 'trigger',
          type: 'trigger-function',
          name: functionName,
          folderId: null,
          pinned: false,
          root: buildScheduleTriggerFunctionRootNode(
            'trigger',
            {
              triggerName,
              // Implicit target — a credential-less vendor's `credentialId` is the vendor id itself
              // (`IntegrationsRuntimeService.discoverImplicitTarget`), no `integrations` document
              // instance needed.
              credentialId: scheduleIntegration.vendor,
              triggerConfig,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
            },
            [buildLogNode('trigger-log', 'schedule fired: ${fire.scheduledAt}')],
          ),
          data: null,
        },
      ],
    };
  };

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const deleteProject = (projectId: string): Promise<unknown> =>
    workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));

  it('schedule-interval: reconciles a real Temporal Schedule, fires it repeatedly, and pauses it on stop', async () => {
    const fixture = buildScheduleFixture(
      `Workflow-tier Schedule interval ${Date.now()}`,
      'everyTwoSeconds',
      'schedule-interval',
      {
        every: '2',
        unit: 'seconds',
      },
    );

    const projectId = await importFixture(fixture);
    try {
      const triggerId = await findDocumentIdByName(projectId, 'everyTwoSeconds');

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      // Discovery tick (30s) activates the project's implicit `schedule` target and registers
      // `registerScheduleBackend`, whose own first `reconcile()` upserts the Temporal Schedule
      // synchronously — 60s covers one worst-case discovery tick plus margin.
      await workflowE2eWaitForValue(async () => {
        const schedules = await listSchedules(projectId);
        const match = schedules.find((schedule) => schedule.documentId === triggerId && schedule.env === 'dev');
        if (match && !match.paused && match.nextFireTimes.length > 0) return match;
      }, 60_000);

      // Every 2 seconds — several fires easily land inside the same 60s activation-lag budget.
      const runs = await workflowE2eWaitForValue(async () => {
        const allRuns = await listWorkflowRuns(projectId);
        const matching = allRuns.filter((run) => run.workflowId.startsWith(`sched-${triggerId}-`));
        const distinctIds = new Set(matching.map((run) => run.workflowId));
        if (distinctIds.size >= 2) return matching;
      }, 60_000);
      expect(new Set(runs.map((run) => run.workflowId)).size).toBeGreaterThanOrEqual(2);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);

      await workflowE2eWaitForValue(async () => {
        const schedules = await listSchedules(projectId);
        const match = schedules.find((schedule) => schedule.documentId === triggerId && schedule.env === 'dev');
        if (match?.paused) return match;
      }, 30_000);
    } finally {
      await deleteProject(projectId);
    }
  }, 150_000);

  it('schedule-cron: reconciles a real Temporal Schedule with the configured next fire times, then supports "Run now"', async () => {
    const fixture = buildScheduleFixture(
      `Workflow-tier Schedule cron ${Date.now()}`,
      'weekdayMorning',
      'schedule-cron',
      {
        expression: '0 9 * * 1-5',
        timezone: 'Europe/Moscow',
      },
    );

    const projectId = await importFixture(fixture);
    try {
      const triggerId = await findDocumentIdByName(projectId, 'weekdayMorning');

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      await workflowE2eWaitForValue(async () => {
        const schedules = await listSchedules(projectId);
        const match = schedules.find((schedule) => schedule.documentId === triggerId && schedule.env === 'dev');
        if (match && !match.paused && match.nextFireTimes.length > 0) return match;
      }, 60_000);

      // "Run now" (ADR 0037 (private) §7 — the toolbar's "Run" button for a `delivery: 'start'`
      // trigger-function): `resolveStartDeliveryArgs` synthesizes the `fire` payload itself, ignoring
      // `args` entirely, so an empty array is fine here.
      const runResponse = await workflowE2eApi()
        .post(`/projects/${projectId}/runs`)
        .set(workflowE2eAuth(token))
        .send({ functionName: 'weekdayMorning', args: [] });
      expect(runResponse.status).toBe(202);
      const started = runResponse.body as IStartedDevRun;
      expect(started.workflowId).toBeTruthy();

      const result = await workflowE2eAwaitWorkflowResult(started.workflowId);
      expect(result).toBeUndefined();

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await deleteProject(projectId);
    }
  }, 150_000);

  it.todo('skips an overlapping fire (SKIP overlap policy — needs a `wait` node, see ADR 0037 Consequences)');
});

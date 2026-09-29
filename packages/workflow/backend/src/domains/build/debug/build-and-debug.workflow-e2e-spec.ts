import type { INode } from '@falang/dto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildLogNode, buildSingleFunctionFixture } from '../../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier port of the debugger's own end-to-end path (ADR 0021 (private) §5, Phase 1's
 * verification requirement) — same shape as `build-and-run.workflow-e2e-spec.ts` (see its own doc
 * comment for the file-naming/`vitest.config.workflow-e2e.ts` rationale): import a fixture, `build`,
 * then drive `debug/start` → poll `.../state` until `paused` → assert the resolved location and
 * scope variables → `resume` → poll until `terminated: completed`, all through real HTTP against
 * `backend`'s real e2e-stack instance (real Temporal, a real k8s runner pod on `kind`).
 *
 * Internal node ids (unlike top-level document ids) survive `POST /projects/import` verbatim — see
 * `ProjectExportService.importProject`'s own doc comment — so the fixture's own `'set-breakpoint'`/
 * `'after-breakpoint'` ids can be used directly as breakpoint `nodeId`s without a post-import lookup;
 * only the *document* id needs resolving (`findDocumentIdByName`), same as every other workflow-tier
 * spec in this package.
 */
describe('build and debug (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

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

  interface IDebugStateBody {
    readonly status: string;
    readonly location: { documentId: string; nodeId: string } | null;
    readonly variables: readonly { name: string; type?: string; value: unknown }[];
    readonly reason: string | null;
  }

  const getDebugState = async (projectId: string, workflowId: string): Promise<IDebugStateBody> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/debug/${workflowId}/state`).set(workflowE2eAuth(token));
    expect(response.status).toBe(200);
    return response.body as IDebugStateBody;
  };

  const waitForDebugStatus = (
    projectId: string,
    workflowId: string,
    status: string,
    timeoutMs: number,
  ): Promise<IDebugStateBody> =>
    workflowE2eWaitForValue(async () => {
      const state = await getDebugState(projectId, workflowId);
      if (state.status !== status) return;
      return state;
    }, timeoutMs);

  const deleteProject = (projectId: string): Promise<unknown> =>
    workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));

  it(
    'pauses on a breakpoint, reports the resolved location and in-scope variables, then runs to completion on resume',
    async () => {
      const bodyChildren: INode[] = [
        { id: 'create-total', name: 'create-var', data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } } },
        buildLogNode('set-breakpoint', 'before'),
        { id: 'increment-total', name: 'action', data: 'total = total + 1' },
        buildLogNode('after-breakpoint', 'after'),
      ];
      const fixture = buildSingleFunctionFixture(`Workflow-tier build & debug ${Date.now()}`, 'greet', bodyChildren);

      const projectId = await importFixture(fixture);
      try {
        const documentId = await findDocumentIdByName(projectId, 'greet');

        const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
        expect(buildResponse.status).toBe(202);
        await waitForDevRunnerStatus(projectId, true, 60_000);

        const startResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/debug/start`)
          .set(workflowE2eAuth(token))
          .send({
            functionName: 'greet',
            args: [],
            breakpoints: [{ documentId, nodeId: 'set-breakpoint' }],
            pauseOnEntry: false,
          });
        expect(startResponse.status).toBe(202);
        const { workflowId } = startResponse.body as { workflowId: string };

        const paused = await waitForDebugStatus(projectId, workflowId, 'paused', 30_000);
        expect(paused).toEqual({
          status: 'paused',
          location: { documentId, nodeId: 'set-breakpoint' },
          variables: [{ name: 'total', type: 'number', value: 0 }],
          reason: 'breakpoint',
        });

        const resumeResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/debug/${workflowId}/resume`)
          .set(workflowE2eAuth(token))
          .send({ mode: 'continue' });
        expect(resumeResponse.status).toBe(204);

        await waitForDebugStatus(projectId, workflowId, 'completed', 30_000);

        await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
        await waitForDevRunnerStatus(projectId, false, 20_000);
      } finally {
        await deleteProject(projectId);
      }
    },
    150_000,
  );

  it(
    'step-over stops at the next statement in the same function, not inside a deeper one',
    async () => {
      const buildCallerBody = (calleeSchemeId: string): INode[] => [
        buildLogNode('caller-first', 'first'),
        { id: 'caller-call', name: 'call-function', data: { schemeId: calleeSchemeId, parameters: [], returnVariable: '' } },
        buildLogNode('caller-after-call', 'after-call'),
      ];
      const fixture: IProjectExportPayload = {
        formatVersion: 1,
        project: { id: '', name: `Workflow-tier step-over ${Date.now()}` },
        folders: [],
        documents: [
          {
            id: 'callee',
            type: 'function',
            name: 'calculateShipping',
            folderId: null,
            pinned: false,
            root: buildFunctionNode('callee', [buildLogNode('callee-log', 'calc')]),
            data: null,
          },
          {
            id: 'caller',
            type: 'function',
            name: 'processOrder',
            folderId: null,
            pinned: false,
            root: buildFunctionNode('caller', buildCallerBody('callee-placeholder')),
            data: null,
          },
        ],
      };

      const projectId = await importFixture(fixture);
      try {
        const callerId = await findDocumentIdByName(projectId, 'processOrder');
        const calleeId = await findDocumentIdByName(projectId, 'calculateShipping');
        await workflowE2eApi()
          .patch(`/projects/${projectId}/documents/${callerId}`)
          .set(workflowE2eAuth(token))
          .send({ root: buildFunctionNode(callerId, buildCallerBody(calleeId)) })
          .expect(200);

        const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
        expect(buildResponse.status).toBe(202);
        await waitForDevRunnerStatus(projectId, true, 60_000);

        const startResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/debug/start`)
          .set(workflowE2eAuth(token))
          .send({
            functionName: 'processOrder',
            args: [],
            breakpoints: [{ documentId: callerId, nodeId: 'caller-first' }],
            pauseOnEntry: false,
          });
        expect(startResponse.status).toBe(202);
        const { workflowId } = startResponse.body as { workflowId: string };

        await waitForDebugStatus(projectId, workflowId, 'paused', 30_000);

        const stepResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/debug/${workflowId}/resume`)
          .set(workflowE2eAuth(token))
          .send({ mode: 'step-over' });
        expect(stepResponse.status).toBe(204);

        // The next statement at the SAME depth is `call-function` itself — stepping over must not
        // land inside `calculateShipping`'s own body one level deeper.
        const paused = await waitForDebugStatus(projectId, workflowId, 'paused', 30_000);
        expect(paused.location).toEqual({ documentId: callerId, nodeId: 'caller-call' });
        expect(paused.reason).toBe('step');

        await workflowE2eApi()
          .post(`/projects/${projectId}/debug/${workflowId}/resume`)
          .set(workflowE2eAuth(token))
          .send({ mode: 'continue' })
          .expect(204);
        await waitForDebugStatus(projectId, workflowId, 'completed', 30_000);

        await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
        await waitForDevRunnerStatus(projectId, false, 20_000);
      } finally {
        await deleteProject(projectId);
      }
    },
    150_000,
  );
});

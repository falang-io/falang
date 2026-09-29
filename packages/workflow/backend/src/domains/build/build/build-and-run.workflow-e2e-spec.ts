import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../../test-utils/workflow-e2e-client.js';
import {
  buildCallFunctionNode,
  buildFunctionNode,
  buildLogNode,
  buildSingleFunctionFixture,
} from '../../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `build-and-run.spec.ts` — see
 * ADR 0018 (private). Same assertions (a compiled function really runs
 * on a real Temporal task queue, backed by a real k8s runner pod), driven entirely through
 * `POST /projects/import` + `build`/`run`/`publish` HTTP calls against `backend`'s real
 * `docker-compose.workflow-e2e.yml` instance instead of the project tree/toolbar UI — no browser.
 * Needs that stack up first (`./scripts/kind-e2e-setup.sh && docker compose -f
 * docker-compose.workflow-e2e.yml up`, or via `npm run test-e2e`/`coverage:e2e`'s own orchestration).
 *
 * Named `*.workflow-e2e-spec.ts`, not `*.workflow-e2e.test.ts` — Vitest's default `include` glob
 * (`**\/*.{test,spec}.?(c|m)[jt]s?(x)`) matches any `.test.ts`/`.spec.ts` file regardless of what
 * comes before it, so a plain `npm test`/`vitest.config.root.ts` aggregate run would otherwise pick
 * this up and fail immediately (`ECONNREFUSED`, nothing at `WORKFLOW_E2E_BACKEND_URL` in that
 * context — live-verified). An explicit `exclude` entry in `vitest.config.ts`/`vitest.config.root.ts`
 * doesn't reliably help here: `vitest.config.root.ts`'s own `projects` glob resolves each matched
 * package's own `test.include`/`test.exclude` independently (only options like `coverage` are
 * truly global across every project), so a root-level exclude added there is silently ignored for
 * a per-package run even though it works when that package's own `npm test` passes
 * `vitest.config.ts` explicitly via `-c`. Run via the root `npm run test-e2e:workflow` script
 * (`vitest.config.workflow-e2e.ts`, a dedicated config with its own explicit `include` for this
 * exact suffix, sidestepping the same discovery problem from the other direction) — not yet wired
 * into `npm run test-e2e`/`coverage:e2e`'s own orchestration as of this file's first version, see
 * that ADR's "Open questions for implementation time".
 */
describe('build and run (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  /** Looks up a document's real (post-import, freshly-minted) id by name — see `importProject`'s doc comment: import mints a fresh id for every regular document, so a fixture-authored id never survives round-tripping through it. */
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

  const deleteProject = (projectId: string): Promise<unknown> =>
    workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));

  it(
    'compiles function documents (including a cross-document call-function), runs a real Temporal workflow through the built worker, and stops it',
    async () => {
      // Two documents, mirroring build-and-run.spec.ts exactly: a callee `processOrder` calls via
      // `call-function`, and a callee `calculateShipping` it targets. Import mints fresh ids for
      // both (see `findDocumentIdByName`'s doc comment), so the callee's real id is only known
      // *after* import — the caller's `call-function` node is seeded with a placeholder `schemeId`
      // in the fixture and patched to the real one below, the same "fixture + a per-test PATCH for
      // whatever import can't know in advance" shape every current browser-tier spec already uses
      // for its one credential (see the ADR's "Reusing project export/import" section).
      const fixture: IProjectExportPayload = {
        formatVersion: 1,
        project: { id: '', name: `Workflow-tier build & run ${Date.now()}` },
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
            root: buildFunctionNode('caller', [buildCallFunctionNode('caller-call', 'callee')]),
            data: null,
          },
        ],
      };

      const projectId = await importFixture(fixture);
      try {
        const calleeId = await findDocumentIdByName(projectId, 'calculateShipping');
        const callerId = await findDocumentIdByName(projectId, 'processOrder');
        await workflowE2eApi()
          .patch(`/projects/${projectId}/documents/${callerId}`)
          .set(workflowE2eAuth(token))
          .send({ root: buildFunctionNode(callerId, [buildCallFunctionNode('caller-call', calleeId)]) })
          .expect(200);

        const buildResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/build`)
          .set(workflowE2eAuth(token));
        expect(buildResponse.status).toBe(202);
        await waitForDevRunnerStatus(projectId, true, 60_000);

        const result = await workflowE2eStartAndAwaitResult('processOrder', `workflow-dev-${projectId}`);
        expect(result).toBeUndefined();

        await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
        await waitForDevRunnerStatus(projectId, false, 20_000);
      } finally {
        await deleteProject(projectId);
      }
    },
    150_000,
  );

  it(
    'publishes a version and runs a real workflow against the stable prod task queue',
    async () => {
      const fixture = buildSingleFunctionFixture(`Workflow-tier publish ${Date.now()}`, 'greet', [
        buildLogNode('greet-log', 'hello'),
      ]);
      const projectId = await importFixture(fixture);
      try {
        const publishResponse = await workflowE2eApi()
          .post(`/projects/${projectId}/publish`)
          .set(workflowE2eAuth(token));
        expect(publishResponse.status).toBe(202);
        expect(publishResponse.body).toEqual(expect.objectContaining({ versionNumber: 1, buildId: 'v1' }));

        // Publishing never auto-starts prod when nothing was running before (see
        // ADR 0004 (private)) — start it explicitly, retrying like
        // the browser-tier spec does (the freshly-spawned runner's poller may not have registered
        // with Temporal's worker-versioning API yet).
        await workflowE2eWaitFor(async () => {
          const response = await workflowE2eApi()
            .post(`/projects/${projectId}/versions/start`)
            .set(workflowE2eAuth(token));
          return response.status < 400;
        }, 20_000);

        const result = await workflowE2eStartAndAwaitResult('greet', `workflow-${projectId}`);
        expect(result).toBeUndefined();
      } finally {
        await deleteProject(projectId);
      }
    },
    150_000,
  );
});

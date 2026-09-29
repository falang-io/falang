import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_BACKEND_URL,
  WORKFLOW_E2E_RUNNER_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildReturnNode } from '../../test-utils/workflow-e2e-fixtures.js';
import {
  buildFilesDownloadNode,
  buildFilesFromTextNode,
  buildFilesPublishNode,
  buildFilesReadTextNode,
} from '../../test-utils/workflow-e2e-fixtures-files.js';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Workflow-tier spec for ADR 0038 (private)'s "Consequences" e2e bullet
 * — the pure `files`-vendor half (no Telegram/OpenAI): `files-download` -> `files-read-text` ->
 * `files-publish` round-trips through a real runner pod and a real `publicUrl` actually serves the
 * bytes from the host, plus a short-`ttlHours` file's `publicUrl` 404s once expired. See
 * `integrations-files.workflow-e2e-spec.ts` for the Telegram-media/AI-attachment half.
 */
describe('integrations (workflow tier): Files — download/read-text/publish, TTL', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  /**
   * `publicUrl` is stamped by `backend` itself with its own `BACKEND_PUBLIC_URL` — in the real e2e
   * stack that's the docker-internal `http://backend:4000` (`docker-compose.workflow-e2e.yml`),
   * unreachable from this test process, which talks to `backend` via its host-published port
   * (`WORKFLOW_E2E_BACKEND_URL`, defaulting to `http://localhost:4001`). The path + public token are
   * real regardless of which origin serves them, so swap the origin before fetching from here.
   */
  const toHostReachableUrl = (publicUrl: string): string => `${WORKFLOW_E2E_BACKEND_URL}${new URL(publicUrl).pathname}`;

  it('files-download -> files-read-text -> files-publish: a real publicUrl serves the bytes, then 404s once deleted', async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Files Download+Publish ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'roundtripFile',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              // `/openai/models` is a plain, unauthenticated `GET` on the mocks service returning a
              // small JSON body (`{"data":[{"id":"mock-model"}]}`) — reachable from inside a runner
              // pod via `WORKFLOW_E2E_RUNNER_MOCKS_URL`, and stands in for "any URL a workflow might
              // download" without needing a dedicated fixture endpoint.
              buildFilesDownloadNode('fn-download', {
                url: `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai/models`,
                name: 'models.json',
                resultVariable: 'f',
              }),
              buildFilesReadTextNode('fn-read', { file: 'f', resultVariable: 'text' }),
              buildFilesPublishNode('fn-publish', { file: 'f', resultVariable: 'pub' }),
              buildReturnNode('fn-return', '{ text, pub }'),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = (await workflowE2eStartAndAwaitResult('roundtripFile', `workflow-dev-${projectId}`)) as {
        text: string;
        pub: { id: string; publicUrl: string };
      };

      expect(result.text).toContain('data');
      expect(typeof result.pub.publicUrl).toBe('string');

      const publicResponse = await fetch(toHostReachableUrl(result.pub.publicUrl));
      expect(publicResponse.status).toBe(200);
      expect(await publicResponse.text()).toContain('data');

      await workflowE2eApi()
        .delete(`/projects/${projectId}/files/${result.pub.id}`)
        .set(workflowE2eAuth(token))
        .expect(200);

      const afterDelete = await fetch(toHostReachableUrl(result.pub.publicUrl));
      expect(afterDelete.status).toBe(404);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);

  it('files-from-text with a short ttlHours: publicUrl 404s once expired, well before the 60s GC sweep', async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Files TTL ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'ttlFile',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              // `0.0003h * 3600 ≈ 1.08s`, floored server-side to a 1-second `x-file-ttl-seconds` (see
              // `activity-helpers.ts`'s `uploadFileFromStream`) — an explicit `ttlSeconds` always wins
              // over the env/quota-derived rule (`file-ttl.ts`'s `resolveExpiresAt`).
              buildFilesFromTextNode('fn-from-text', {
                text: '"ttl test"',
                name: 'ttl.txt',
                mime: 'text/plain',
                ttlHours: '0.0003',
                resultVariable: 'f',
              }),
              buildFilesPublishNode('fn-publish', { file: 'f', resultVariable: 'pub' }),
              buildReturnNode('fn-return', 'pub'),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const pub = (await workflowE2eStartAndAwaitResult('ttlFile', `workflow-dev-${projectId}`)) as {
        id: string;
        publicUrl: string;
      };
      expect(typeof pub.publicUrl).toBe('string');

      // Wait past the ~1s TTL, nowhere near `FileGcService`'s own 60s sweep — the row is still there
      // (`GET /projects/:id/files` still lists it below) and only the *public* route's own expiry
      // check (`FilesService.getPublic`) is what turns this into a 404; `removeExpired`/GC deleting
      // the row outright is a separate, much slower path this spec deliberately doesn't wait for.
      await delay(3000);

      const expiredResponse = await fetch(toHostReachableUrl(pub.publicUrl));
      expect(expiredResponse.status).toBe(404);

      const filesList = await workflowE2eApi().get(`/projects/${projectId}/files`).set(workflowE2eAuth(token));
      expect(filesList.status).toBe(200);
      const filesBody = filesList.body as { files: readonly { id: string }[] };
      expect(filesBody.files.some((file) => file.id === pub.id)).toBe(true);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});

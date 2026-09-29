import { diffSnapshots, type IProjectSnapshot } from '@falang/versioning';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildFunctionNode,
  buildLogNode,
  buildSingleFunctionFixture,
} from '../../../test-utils/workflow-e2e-fixtures.js';
import { workflowE2eApi, workflowE2eAuth, workflowE2eLogin } from '../../../test-utils/workflow-e2e-client.js';

/**
 * Workflow-tier port of package C's own in-memory sqlite coverage (`versioning.e2e.test.ts`) — see
 * ADR 0018 (private) for the pattern (a bare HTTP client against
 * `backend`'s real e2e-stack instance, no browser) and ADR 0025 (private) for
 * what's under test. Exercises the one thing the sqlite harness can't: `BuildService.publish()`'s
 * real one-commit-per-publish tie-in, which needs a real compile + `ProjectVersion` row, not just the
 * `VersioningService` in isolation.
 *
 * Live-verified against the real `docker-compose.workflow-e2e.yml` stack on the `falang-workflow-e2e`
 * `kind` cluster (`npm run test-e2e:workflow`) as part of ADR 0025 (private)'s package F — found and
 * fixed one bug in this spec's own final assertion (compared the restored tree's node ids against
 * the document's real, import-remapped id instead of `buildSingleFunctionFixture`'s own literal
 * `'fn'`-prefixed ids, which import leaves untouched — see the assertion's own comment below); the
 * restore mechanism itself was already correct.
 */
describe('versioning (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const importFixture = async (name: string): Promise<string> => {
    const fixture = buildSingleFunctionFixture(name, 'greet', [buildLogNode('greet-log', 'hello')]);
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const findDocumentIdByName = async (projectId: string, name: string): Promise<string> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
    const document = (response.body as readonly { id: string; name: string }[]).find((doc) => doc.name === name);
    if (!document) throw new Error(`No document named "${name}" in project ${projectId}`);
    return document.id;
  };

  const deleteProject = (projectId: string): Promise<unknown> =>
    workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));

  it('diffs two real commits and restores a project back to the first one', async () => {
    const projectId = await importFixture(`Workflow-tier versioning ${Date.now()}`);
    try {
      const functionId = await findDocumentIdByName(projectId, 'greet');

      const firstCommit = await workflowE2eApi()
        .post(`/projects/${projectId}/commits`)
        .set(workflowE2eAuth(token))
        .send({ kind: 'named', message: 'Before edit' });
      expect(firstCommit.status).toBe(200);
      expect(firstCommit.body).not.toBeNull();

      const editedRoot = buildFunctionNode(functionId, [buildLogNode(`${functionId}-log`, 'hello, edited')]);
      await workflowE2eApi()
        .patch(`/projects/${projectId}/documents/${functionId}`)
        .set(workflowE2eAuth(token))
        .send({ root: editedRoot })
        .expect(200);

      const secondCommit = await workflowE2eApi()
        .post(`/projects/${projectId}/commits`)
        .set(workflowE2eAuth(token))
        .send({ kind: 'named', message: 'After edit' });
      expect(secondCommit.status).toBe(200);
      expect(secondCommit.body).not.toBeNull();

      const firstSnapshotResponse = await workflowE2eApi()
        .get(`/projects/${projectId}/commits/${firstCommit.body.id}`)
        .set(workflowE2eAuth(token));
      const secondSnapshotResponse = await workflowE2eApi()
        .get(`/projects/${projectId}/commits/${secondCommit.body.id}`)
        .set(workflowE2eAuth(token));
      const firstSnapshot = firstSnapshotResponse.body as IProjectSnapshot;
      const secondSnapshot = secondSnapshotResponse.body as IProjectSnapshot;

      const diff = diffSnapshots(firstSnapshot, secondSnapshot);
      expect(diff.isEmpty).toBe(false);
      const functionDiff = diff.documents.find((document) => document.documentId === functionId);
      expect(functionDiff?.kind).toBe('modified');
      expect(functionDiff?.tree?.isEmpty).toBe(false);

      const restoreResponse = await workflowE2eApi()
        .post(`/projects/${projectId}/commits/${firstCommit.body.id}/restore`)
        .set(workflowE2eAuth(token));
      expect(restoreResponse.status).toBe(200);

      // There is no `GET /projects/:id/documents/:documentId` route — every workflow-tier spec
      // reads a single document back through the list route instead (see
      // `build-and-run.workflow-e2e-spec.ts`'s own `findDocumentIdByName`).
      const documentsResponse = await workflowE2eApi()
        .get(`/projects/${projectId}/documents`)
        .set(workflowE2eAuth(token));
      const restoredFunction = (documentsResponse.body as readonly { id: string; root?: unknown }[]).find(
        (document) => document.id === functionId,
      );
      // The restored tree is the *first* commit's — taken straight from `buildSingleFunctionFixture`'s
      // own fixture (never PATCHed), whose root/children ids are its own literal `'fn'`-prefixed ones
      // (see that helper), not `functionId` — only the *document*'s own top-level id is remapped by
      // `POST /projects/import` (ADR 0018 (private)'s own noted gap: it "remaps top-level document
      // ids but not ... node references embedded in a document's own tree", which extends to a
      // document's own internal node ids too, left exactly as authored).
      // `JSON.parse(JSON.stringify(...))`: `buildFunctionNode`'s `function-body` data carries an
      // explicit `returnValue: undefined` (its 3rd param defaults to `undefined`, still an own
      // property of the object literal) — `restoredFunction.root` came back over real HTTP JSON,
      // which drops `undefined`-valued keys entirely, and `toMatchObject` treats "key present with
      // value `undefined`" as different from "key absent" — so both sides need the same JSON round
      // trip before comparing.
      expect(restoredFunction?.root).toMatchObject(
        // oxlint-disable-next-line unicorn/prefer-structured-clone -- deliberately JSON, not structuredClone: the point is dropping `undefined`-valued keys the same way the real HTTP JSON response already did, which structuredClone would preserve instead.
        JSON.parse(JSON.stringify(buildFunctionNode('fn', [buildLogNode('greet-log', 'hello')]))),
      );
    } finally {
      await deleteProject(projectId);
    }
  }, 120_000);

  it('publishing ties the new version to a real commit', async () => {
    const projectId = await importFixture(`Workflow-tier publish commit ${Date.now()}`);
    try {
      const publishResponse = await workflowE2eApi().post(`/projects/${projectId}/publish`).set(workflowE2eAuth(token));
      expect(publishResponse.status).toBe(202);
      expect(publishResponse.body.commitId).toEqual(expect.any(String));

      const commits = await workflowE2eApi().get(`/projects/${projectId}/commits`).set(workflowE2eAuth(token));
      expect(commits.body).toHaveLength(1);
      expect(commits.body[0]).toMatchObject({ id: publishResponse.body.commitId, kind: 'named' });
      expect(commits.body[0].message).toContain('Publish v1');
    } finally {
      await deleteProject(projectId);
    }
  }, 120_000);
});

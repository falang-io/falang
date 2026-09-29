import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  WORKFLOW_E2E_BACKEND_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildLogNode, buildSingleFunctionFixture } from '../../test-utils/workflow-e2e-fixtures.js';

/** The one text content block every tool here returns (see `mcp-tool-result.ts`'s `okResult`/`errorResult`). */
const toolText = (result: unknown): string =>
  ((result as { content?: readonly unknown[] }).content?.[0] as { text?: string } | undefined)?.text ?? '';

/**
 * Workflow-tier live verification of `/mcp` (ADR 0029 (private) phase F) —
 * same style/harness as `build-and-run.workflow-e2e-spec.ts` (plain Vitest, a bare client against
 * `backend`'s real e2e-stack instance, no browser), but driven through the MCP SDK's own `Client` +
 * `StreamableHTTPClientTransport` instead of raw `supertest` calls, since the whole point is proving
 * a real MCP client can drive the same stack an agent would: login → create a real PAT over the
 * existing REST `/auth/tokens` route → connect the MCP client with it → `import_project` (reusing the
 * same fixture format/builders `build-and-run.workflow-e2e-spec.ts` uses) → `build` → `start_dev_run`
 * → poll `get_run_position` until the execution leaves `RUNNING` → `get_run_history`.
 *
 * `*.workflow-e2e-spec.ts` (not `*.workflow-e2e.test.ts`) for the same Vitest-discovery reason every
 * sibling spec in this directory gives — see `vitest.config.workflow-e2e.ts` / the root
 * `test-e2e:workflow` script. Needs the real `docker-compose.workflow-e2e.yml` stack up and reachable.
 */
describe('/mcp (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const createPat = async (): Promise<string> => {
    const response = await workflowE2eApi()
      .post('/auth/tokens')
      .set(workflowE2eAuth(token))
      .send({ name: `mcp workflow-e2e ${Date.now()}` });
    expect(response.status).toBe(201);
    return (response.body as { rawToken: string }).rawToken;
  };

  const connectMcpClient = async (rawToken: string): Promise<Client> => {
    const client = new Client({ name: 'workflow-e2e-mcp-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${WORKFLOW_E2E_BACKEND_URL}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${rawToken}` } },
    });
    await client.connect(transport);
    return client;
  };

  const deleteProject = (projectId: string): Promise<unknown> =>
    workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));

  it('imports a project, builds it, starts a dev run, and follows it to completion — all through a real MCP client over PAT auth', async () => {
    const rawToken = await createPat();
    const client = await connectMcpClient(rawToken);
    let projectId = '';
    try {
      const fixture = buildSingleFunctionFixture(`MCP workflow-e2e ${Date.now()}`, 'greet', [
        buildLogNode('greet-log', 'hello from mcp'),
      ]);

      const importResult = await client.callTool({ name: 'import_project', arguments: { payload: fixture } });
      expect(importResult.isError).not.toBe(true);
      const imported = JSON.parse(toolText(importResult)) as { id: string };
      projectId = imported.id;
      expect(projectId).toBeTruthy();

      const buildResult = await client.callTool({ name: 'build', arguments: { projectId } });
      expect(buildResult.isError).not.toBe(true);

      const runResult = await client.callTool({
        name: 'start_dev_run',
        arguments: { projectId, functionName: 'greet', args: [] },
      });
      expect(runResult.isError).not.toBe(true);
      const started = JSON.parse(toolText(runResult)) as { workflowId: string; runId: string };
      expect(started.workflowId).toBeTruthy();
      expect(started.runId).toBeTruthy();

      // Poll get_run_position until the execution leaves RUNNING — mirrors the client's own
      // `LiveRunStore` polling model (ADR 0022 (private)), driven here through the MCP tool
      // instead of the REST route directly.
      const finalStatus = await workflowE2eWaitForValue(
        async () => {
          const positionResult = await client.callTool({
            name: 'get_run_position',
            arguments: { projectId, workflowId: started.workflowId, runId: started.runId },
          });
          const position = JSON.parse(toolText(positionResult)) as { status: string };
          // Falsy (not `undefined`) so `workflowE2eWaitForValue`'s truthy check keeps polling.
          return position.status === 'RUNNING' ? '' : position.status;
        },
        60_000,
        1000,
      );
      expect(finalStatus).toBe('COMPLETED');

      const historyResult = await client.callTool({
        name: 'get_run_history',
        arguments: { workflowId: started.workflowId, runId: started.runId },
      });
      expect(historyResult.isError).not.toBe(true);
      const history = JSON.parse(toolText(historyResult)) as { events: readonly unknown[] };
      expect(history.events.length).toBeGreaterThan(0);
    } finally {
      await client.close();
      if (projectId) await deleteProject(projectId);
    }
  }, 90_000);
});

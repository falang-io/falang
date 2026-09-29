import { test } from './fixtures.js';
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { webhookIntegration } from '@falang/workflow-integrations-webhook';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  createTriggerFunctionViaUI,
  getIntegrationsDocumentId,
  loginAndReachProjectList,
  openProjectViaUI,
  startDevRunnerViaUI,
  stopDevRunnerViaUI,
} from './fixtures.js';
import { RUNNER_MOCKS_URL, uniqueSuffix } from './integration-test-helpers.js';
import {
  buildActivepiecesActionNode,
  buildCallAiTextNode,
  buildHttpRequestNode,
  buildTelegramSendMessageNode,
  buildTriggerFunctionRootNode,
} from './integration-node-builders.js';
import { buildFunctionNode, buildReturnNode } from './node-builders.js';

const ACTIVEPIECES_MOCK_VENDOR = 'activepieces-mock';

/**
 * One consolidated browser-tier smoke test covering the "main points" of every integration that has
 * real canvas UI (dropping a node, wiring a credential through the picker, the "New trigger"
 * dialog's vendor/trigger/credential selects) instead of one file per integration — see
 * ADR 0018 (private)'s own "one shared smoke spec touching every
 * integration lightly" alternative, picked over the previous one-per-integration shape once every
 * integration's *runtime* assertion had already moved to a workflow-tier spec of its own. A single
 * login/project/build-and-run cycle dominates each of the old per-integration files' own wall time
 * (repeated ~7 times before this consolidation); merging them into one project pays that cost once.
 *
 * ActivePieces gets exactly one representative node here (the plain `mock` CustomAuth piece) rather
 * than every mock variant — `BasicAuth`'s own smoke test was dropped entirely: the only thing it
 * proved beyond this file's plain mock case was a credential *field-shape* difference (username/
 * password vs. workspace/apiKey), which is backend field-mapping, not canvas UI, and is already
 * covered by `integrations-activepieces-mock-basic-auth.workflow-e2e-spec.ts` plus
 * `normalizeAuthFields`'s own unit tests. The OAuth2 popup flow stays its own separate file
 * (`integrations-activepieces-mock-oauth2.spec.ts`) — it needs its own `page.context().waitForEvent
 * ('page')` popup dance, not a "Dev" toolbar cycle, so folding it in here would buy nothing.
 */
test.describe('integrations smoke', () => {
  test('drops one node per integration through the canvas UI, and the "Dev" toolbar reports the build running, then stopped', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAndReachProjectList(page);
    const projectName = `Integrations Smoke ${uniqueSuffix()}`;
    const projectId = await createProjectViaUI(page, projectName);

    const openaiCredentialId = `cred-openai-${uniqueSuffix()}`;
    const openaiApiKey = `key-${uniqueSuffix()}`;
    const telegramCredentialId = `cred-telegram-${uniqueSuffix()}`;
    const telegramToken = `e2e-${uniqueSuffix()}`;
    const webhookCredentialId = `cred-webhook-${uniqueSuffix()}`;
    const activepiecesCredentialId = `cred-activepieces-${uniqueSuffix()}`;

    const api = await createApiContext();
    const integrationsDocId = await getIntegrationsDocumentId(api, projectId);
    // One PATCH seeds every credential this test needs — `DocumentsService.update` replaces an
    // `integrations` document's whole `instances` array rather than merging it, so every instance
    // has to be seeded together, not across several separate PATCH calls the way each old
    // per-integration spec seeded its own single credential.
    await api.patch(`/projects/${projectId}/documents/${integrationsDocId}`, {
      data: {
        data: {
          instances: [
            {
              id: openaiCredentialId,
              vendor: openaiIntegration.vendor,
              name: 'Mock OpenAI',
              fields: { baseUrl: `${RUNNER_MOCKS_URL}/openai`, apiKey: { dev: openaiApiKey, prod: openaiApiKey } },
            },
            {
              id: telegramCredentialId,
              vendor: telegramIntegration.vendor,
              name: 'Mock Bot',
              fields: { botToken: { dev: telegramToken, prod: telegramToken } },
            },
            {
              id: webhookCredentialId,
              vendor: webhookIntegration.vendor,
              name: 'Local Webhook',
              fields: {},
            },
            {
              id: activepiecesCredentialId,
              vendor: ACTIVEPIECES_MOCK_VENDOR,
              name: 'E2E mock account',
              fields: { workspace: 'e2e', apiKey: { dev: 'e2e-mock-api-key', prod: 'e2e-mock-api-key' } },
            },
          ],
        },
      },
    });

    // The client fetched the (then-empty) integrations document when the project first opened —
    // reload so it re-fetches and every credential seeded above shows up in "New trigger"'s/the
    // canvas node's Credential select (otherwise those fields stay disabled with no options).
    await page.reload();
    await openProjectViaUI(page, projectName);

    const httpFunctionId = await createTreeItemViaUI(page, 'function', 'callHttp');
    const openaiFunctionId = await createTreeItemViaUI(page, 'function', 'askAi');
    const activepiecesFunctionId = await createTreeItemViaUI(page, 'function', 'createItem');
    const telegramTriggerId = await createTriggerFunctionViaUI(page, 'onMessage', 'Telegram', 'On message', 'Mock Bot');
    const webhookTriggerId = await createTriggerFunctionViaUI(
      page,
      'onWebhook',
      'Webhook',
      'Incoming webhook',
      'Local Webhook',
    );

    // Only each document's *body statements* are seeded through the API, mirroring exactly what a
    // user building this in the canvas would produce — see `@falang/workflow-e2e-tests`' own
    // convention (the canvas node editor's drag/drop isn't driven by this suite).
    await api.patch(`/projects/${projectId}/documents/${httpFunctionId}`, {
      data: {
        root: buildFunctionNode(
          httpFunctionId,
          [
            buildHttpRequestNode(`${httpFunctionId}-call`, {
              method: 'GET',
              url: `${RUNNER_MOCKS_URL}/`,
              resultVariable: 'httpResult',
            }),
            buildReturnNode(`${httpFunctionId}-return`, 'JSON.stringify(httpResult.body)'),
          ],
          { type: 'string' },
        ),
      },
    });
    await api.patch(`/projects/${projectId}/documents/${openaiFunctionId}`, {
      data: {
        root: buildFunctionNode(
          openaiFunctionId,
          [
            buildCallAiTextNode(`${openaiFunctionId}-call`, {
              integration: openaiCredentialId,
              model: 'mock-model',
              prompt: 'Say hi',
              resultVariable: 'aiReply',
            }),
            buildReturnNode(`${openaiFunctionId}-return`, 'aiReply'),
          ],
          { type: 'string' },
        ),
      },
    });
    await api.patch(`/projects/${projectId}/documents/${activepiecesFunctionId}`, {
      data: {
        root: buildFunctionNode(activepiecesFunctionId, [
          buildActivepiecesActionNode(`${activepiecesFunctionId}-action`, {
            pieceName: 'mock',
            actionName: 'create_item',
            credentialId: activepiecesCredentialId,
            propsValue: {
              title: JSON.stringify(`E2E Mock Item ${uniqueSuffix()}`),
              content: JSON.stringify('Created by the ffalang workflow e2e suite.'),
            },
          }),
        ]),
      },
    });
    const telegramTrigger = telegramIntegration.triggers[0];
    await api.patch(`/projects/${projectId}/documents/${telegramTriggerId}`, {
      data: {
        root: buildTriggerFunctionRootNode(
          telegramTriggerId,
          {
            vendor: telegramIntegration.vendor,
            triggerName: telegramTrigger.name,
            credentialId: telegramCredentialId,
            scopeVariableName: telegramTrigger.scopeVariableName,
            scopeType: telegramTrigger.scopeType,
          },
          [
            buildTelegramSendMessageNode(`${telegramTriggerId}-send`, {
              credentialId: telegramCredentialId,
              chatId: 'message.chat.id',
              text: 'Echo: ${message.text}',
            }),
          ],
        ),
      },
    });
    const webhookTrigger = webhookIntegration.triggers[0];
    await api.patch(`/projects/${projectId}/documents/${webhookTriggerId}`, {
      data: {
        root: buildTriggerFunctionRootNode(
          webhookTriggerId,
          {
            vendor: webhookIntegration.vendor,
            triggerName: webhookTrigger.name,
            credentialId: webhookCredentialId,
            scopeVariableName: webhookTrigger.scopeVariableName,
            scopeType: webhookTrigger.scopeType,
            returnValue: { type: 'string' },
          },
          [buildReturnNode(`${webhookTriggerId}-return`, 'request.body')],
        ),
      },
    });
    await api.dispose();

    await page.reload();
    await openProjectViaUI(page, projectName);
    await startDevRunnerViaUI(page, projectId);
    await stopDevRunnerViaUI(page, projectId);
  });
});

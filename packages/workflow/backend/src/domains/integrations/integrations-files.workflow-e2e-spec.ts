import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getOpenAiRequests, getTelegramCalls, pushTelegramUpdate, queueOpenAiResponse } from '@falang/workflow-mocks';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  WORKFLOW_E2E_RUNNER_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import {
  buildCallAiTextNode,
  buildTelegramSendFileNode,
  buildTriggerFunctionRootNode,
} from '../../test-utils/workflow-e2e-fixtures.js';

/** A minimal, valid 1x1 transparent PNG — same stand-in `@falang/workflow-mocks`' own `openai-mock.ts` uses for `/images/generations`, reused here as the incoming "photo" bytes the Telegram mock serves back from its `getFile`/download route (the mock never decodes it, so a PNG stands in fine for the "jpeg" the seed's own `mime`/`file_path` claim it to be). */
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Workflow-tier spec for ADR 0038 (private)'s "Consequences" e2e bullet
 * — a real Telegram-mock `message.photo` update resolved into a `files/File` at ingress, attached to
 * a real `call-ai-text` call (the OpenAI mock records the resulting `image_url` data-URL content
 * part), and echoed back out through `telegram-send-file` (the Telegram mock records the resulting
 * multipart `sendPhoto`). Driven entirely through `POST /projects/import` + `build` HTTP calls — no
 * browser. See `integrations-telegram.workflow-e2e-spec.ts`/`integrations-openai.workflow-e2e-spec.ts`
 * for the per-vendor patterns this combines, and `integrations-files-download.workflow-e2e-spec.ts`
 * for the pure-`files`-vendor (no Telegram/OpenAI) round-trip + TTL specs.
 *
 * The uploaded `File`'s mime is asserted as `image/jpeg`, not the seed's own literal `image/png` —
 * Telegram's Bot API always re-encodes an incoming photo to JPEG server-side and its `PhotoSize`
 * carries no `mime_type` at all, so `telegram-media.ts`'s `resolveIncomingMedia` defaults a photo's
 * mime/extension to `image/jpeg`/`.jpg` regardless of the seeded bytes' real content type (see that
 * package's own `telegram-media.test.ts`).
 */
describe('integrations (workflow tier): Files — Telegram media + AI attachment + send-file', () => {
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

  it('telegram photo -> call-ai-text attachment -> telegram-send-file echoes it back', async () => {
    const botToken = `e2e-${Date.now()}`;
    const telegramCredentialId = `cred-tg-${Date.now()}`;
    const apiKey = `key-${Date.now()}`;
    const openaiCredentialId = `cred-oa-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];

    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Files+Telegram+AI ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'integrations',
          type: 'integrations',
          name: 'Integrations',
          folderId: null,
          pinned: true,
          root: null,
          data: {
            instances: [
              {
                id: telegramCredentialId,
                vendor: telegramIntegration.vendor,
                name: 'Mock Bot',
                fields: { botToken: { dev: botToken, prod: botToken } },
              },
              {
                id: openaiCredentialId,
                vendor: openaiIntegration.vendor,
                name: 'Mock OpenAI',
                fields: {
                  baseUrl: `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai`,
                  apiKey: { dev: apiKey, prod: apiKey },
                },
              },
            ],
          },
        },
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onPhoto',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: telegramIntegration.vendor,
              triggerName: trigger.name,
              credentialId: telegramCredentialId,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
            },
            [
              buildCallAiTextNode('trigger-ai', {
                integration: openaiCredentialId,
                model: 'mock-model',
                prompt: 'describe',
                attachments: '[message.photo]',
                resultVariable: 'answer',
              }),
              buildTelegramSendFileNode('trigger-send-file', {
                credentialId: telegramCredentialId,
                chatId: 'message.chat.id',
                file: 'message.photo',
                as: 'auto',
                caption: '${answer}',
              }),
            ],
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

      await queueOpenAiResponse(WORKFLOW_E2E_MOCKS_URL, apiKey, 'A cute cat photo');

      await pushTelegramUpdate(
        WORKFLOW_E2E_MOCKS_URL,
        botToken,
        {
          message: {
            message_id: 100,
            date: Math.floor(Date.now() / 1000),
            chat: { id: 555, type: 'private' },
            // Bot API's real `PhotoSize` never carries `file_name`/`mime_type` — `telegram-media.ts`'s
            // `resolveIncomingMedia` fills both in from its own `image/jpeg`/`.jpg` photo defaults.
            photo: [{ file_id: 'photo-1', file_unique_id: 'photo-1-unique', width: 800, height: 800, file_size: 68 }],
          },
        },
        [{ file_id: 'photo-1', file_path: 'photos/p.jpg', mime: 'image/jpeg', base64: ONE_PIXEL_PNG_BASE64 }],
      );

      const sendPhotoCall = await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'sendPhoto');
      }, 60_000);
      const sendPhotoBody = sendPhotoCall.body as {
        chat_id?: string;
        caption?: string;
        field?: string;
        filename?: string;
        byteLength?: number;
      };
      expect(sendPhotoBody.chat_id).toBe('555');
      expect(sendPhotoBody.caption).toBe('A cute cat photo');
      expect(sendPhotoBody.field).toBe('photo');
      expect(sendPhotoBody.filename).toBe('photo-photo-1-unique.jpg');
      expect(sendPhotoBody.byteLength).toBeGreaterThan(0);

      const requests = await getOpenAiRequests(WORKFLOW_E2E_MOCKS_URL, apiKey);
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            model: 'mock-model',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'describe' },
                  { type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } },
                ],
              },
            ],
          }),
        ]),
      );

      const filesList = await workflowE2eApi().get(`/projects/${projectId}/files`).set(workflowE2eAuth(token));
      expect(filesList.status).toBe(200);
      const filesBody = filesList.body as {
        files: readonly { createdBy: string; expiresAt: string | null; mime: string }[];
      };
      const ingressFile = filesBody.files.find((file) => file.createdBy === 'ingress:telegram');
      expect(ingressFile).toBeTruthy();
      expect(ingressFile?.mime).toBe('image/jpeg');
      // Default ingress TTL is 7 days (ADR 0038 (private) §2/§4) — asserted loosely (a wide band, not
      // an exact millisecond match) since real wall-clock time passes between upload and this read.
      const expiresAtMs = new Date(ingressFile?.expiresAt as string).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiresAtMs - Date.now()).toBeGreaterThan(sevenDaysMs - 5 * 60_000);
      expect(expiresAtMs - Date.now()).toBeLessThan(sevenDaysMs + 5 * 60_000);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});

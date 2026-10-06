// oxlint-disable no-undefined -- `undefined` is the "not yet" signal of the polling helpers.
import type { IRunJournalEntry, IRunJournalPage } from '@falang/workflow-dto';
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getTelegramCalls } from '@falang/workflow-mocks';
import type { IProjectExportPayload } from '../domains/projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  WORKFLOW_E2E_RUNNER_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eWaitForValue,
} from './workflow-e2e-client.js';
import {
  buildCallAiTextNode,
  buildTelegramQuestionNode,
  buildTelegramSendMessageNode,
  buildTriggerFunctionRootNode,
  buildLogNode,
} from './workflow-e2e-fixtures.js';

/** Helpers of `run-journal.workflow-e2e-spec.ts` (ADR 0059 (private) §4) — split out to stay under the per-file line cap. */

export const PROMPT_MARKER = 'SECRET-PROMPT-marker';
export const AI_ANSWER_MARKER = 'AI-ANSWER-marker';

export interface IBotFixtureIds {
  readonly botToken: string;
  readonly telegramCredentialId: string;
  readonly openaiCredentialId: string;
  readonly openaiApiKey: string;
}

export const newBotIds = (suffix: string): IBotFixtureIds => {
  const stamp = `${Date.now()}-${suffix}`;
  return {
    botToken: `e2e-journal-${stamp}`,
    telegramCredentialId: `cred-tg-${stamp}`,
    openaiCredentialId: `cred-ai-${stamp}`,
    openaiApiKey: `key-journal-${stamp}`,
  };
};

const buildIntegrationsDocument = (
  ids: IBotFixtureIds,
  openaiBaseUrl: string,
): IProjectExportPayload['documents'][number] => ({
  id: 'integrations',
  type: 'integrations',
  name: 'Integrations',
  folderId: null,
  pinned: true,
  root: null,
  data: {
    instances: [
      {
        id: ids.telegramCredentialId,
        vendor: telegramIntegration.vendor,
        name: 'Mock Bot',
        fields: { botToken: { dev: ids.botToken, prod: ids.botToken } },
      },
      {
        id: ids.openaiCredentialId,
        vendor: openaiIntegration.vendor,
        name: 'Mock OpenAI',
        fields: { baseUrl: openaiBaseUrl, apiKey: { dev: ids.openaiApiKey, prod: ids.openaiApiKey } },
      },
    ],
  },
});

export const NODE_IDS = {
  log: 'trigger-log',
  ai: 'trigger-ai',
  question: 'trigger-question',
  replyA: 'trigger-reply-a',
  replyB: 'trigger-reply-b',
} as const;

const triggerDocument = (ids: IBotFixtureIds, body: Parameters<typeof buildTriggerFunctionRootNode>[2]) => {
  const trigger = telegramIntegration.triggers[0];
  return {
    id: 'trigger',
    type: 'trigger-function' as const,
    name: 'onMessage',
    folderId: null,
    pinned: false,
    root: buildTriggerFunctionRootNode(
      'trigger',
      {
        vendor: telegramIntegration.vendor,
        triggerName: trigger.name,
        credentialId: ids.telegramCredentialId,
        scopeVariableName: trigger.scopeVariableName,
        scopeType: trigger.scopeType,
      },
      body,
    ),
    data: null,
  };
};

/** trigger -> log -> call-ai-text -> telegram-question (A / B, each answered by a send-message). */
export const buildBotFixture = (name: string, ids: IBotFixtureIds): IProjectExportPayload => ({
  formatVersion: 1,
  project: { id: '', name },
  folders: [],
  documents: [
    buildIntegrationsDocument(ids, `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai`),
    triggerDocument(ids, [
      buildLogNode(NODE_IDS.log, 'processing the request'),
      buildCallAiTextNode(NODE_IDS.ai, {
        integration: ids.openaiCredentialId,
        model: 'mock-model',
        prompt: PROMPT_MARKER,
        resultVariable: 'aiReply',
      }),
      buildTelegramQuestionNode(
        NODE_IDS.question,
        { credentialId: ids.telegramCredentialId, chatId: 'message.chat.id', question: 'Pick A or B' },
        [
          {
            label: 'A',
            children: [
              buildTelegramSendMessageNode(NODE_IDS.replyA, {
                credentialId: ids.telegramCredentialId,
                chatId: 'message.chat.id',
                text: 'Chose A',
              }),
            ],
          },
          {
            label: 'B',
            children: [
              buildTelegramSendMessageNode(NODE_IDS.replyB, {
                credentialId: ids.telegramCredentialId,
                chatId: 'message.chat.id',
                text: 'Chose B',
              }),
            ],
          },
        ],
      ),
    ]),
  ],
});

/** trigger -> call-ai-text whose credential points at a path the mock does not serve (a 404 = a failing activity). */
export const buildFailingAiFixture = (name: string, ids: IBotFixtureIds): IProjectExportPayload => ({
  formatVersion: 1,
  project: { id: '', name },
  folders: [],
  documents: [
    buildIntegrationsDocument(ids, `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai-does-not-exist`),
    triggerDocument(ids, [
      buildCallAiTextNode(NODE_IDS.ai, {
        integration: ids.openaiCredentialId,
        model: 'mock-model',
        prompt: PROMPT_MARKER,
        resultVariable: 'aiReply',
      }),
    ]),
  ],
});

/** Position of the question's `sendMessage` in the mock's message numbering (it hands out ids 1, 2, … per `sendMessage`). */
export const waitForQuestionMessageId = (botToken: string, alreadySeen: number): Promise<number> =>
  workflowE2eWaitForValue(async () => {
    const allCalls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
    const calls = allCalls.filter((call) => call.method === 'sendMessage');
    const questions = calls
      .map((call, index) => ({ call, id: index + 1 }))
      .filter(({ call }) => (call.body as { reply_markup?: unknown }).reply_markup !== undefined);
    return questions.length > alreadySeen ? questions[alreadySeen].id : undefined;
  }, 60_000);

export const waitForSentText = (botToken: string, text: string): Promise<unknown> =>
  workflowE2eWaitForValue(async () => {
    const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
    return calls.find((call) => call.method === 'sendMessage' && (call.body as { text?: string }).text === text);
  }, 60_000);

interface IRunRef {
  readonly workflowId: string;
  readonly runId: string;
}

/** The newest execution of the project's dev stand that is not in `known` (an array of `workflowId/runId`). */
export const waitForNewRun = (token: string, projectId: string, known: ReadonlySet<string>): Promise<IRunRef> =>
  workflowE2eWaitForValue(async () => {
    const response = await workflowE2eApi().get(`/workflow-runs?projectId=${projectId}`).set(workflowE2eAuth(token));
    const runs = response.body as readonly (IRunRef & { startTime: string })[];
    return runs
      .filter((run) => !known.has(`${run.workflowId}/${run.runId}`))
      .toSorted((a, b) => b.startTime.localeCompare(a.startTime))[0];
  }, 60_000);

export const runKey = (run: IRunRef): string => `${run.workflowId}/${run.runId}`;

export const fetchWorkflowJournal = async (
  token: string,
  projectId: string,
  workflowId: string,
): Promise<readonly IRunJournalEntry[]> => {
  const response = await workflowE2eApi()
    .get(`/projects/${projectId}/workflows/${encodeURIComponent(workflowId)}/journal?limit=1000`)
    .set(workflowE2eAuth(token));
  if (response.status !== 200) throw new Error(`journal answered ${response.status}`);
  return (response.body as IRunJournalPage).entries;
};

export const fetchRunJournal = async (token: string, projectId: string, run: IRunRef): Promise<IRunJournalPage> => {
  const response = await workflowE2eApi()
    .get(
      `/projects/${projectId}/runs/${encodeURIComponent(run.workflowId)}/${encodeURIComponent(run.runId)}/journal?limit=1000`,
    )
    .set(workflowE2eAuth(token));
  if (response.status !== 200) throw new Error(`run journal answered ${response.status}`);
  return response.body as IRunJournalPage;
};

/** Journal entries land ~1-2 s after the fact (async producers) — poll until `done(entries)`, returning that snapshot. */
export const waitForJournal = (
  token: string,
  projectId: string,
  workflowId: string,
  done: (entries: readonly IRunJournalEntry[]) => boolean,
  timeoutMs = 45_000,
): Promise<readonly IRunJournalEntry[]> =>
  workflowE2eWaitForValue(async () => {
    const entries = await fetchWorkflowJournal(token, projectId, workflowId);
    return done(entries) ? entries : undefined;
  }, timeoutMs);

/** The client's display order: `(ts, id)`. */
export const sortEntries = (entries: readonly IRunJournalEntry[]): IRunJournalEntry[] =>
  entries.toSorted((a, b) => {
    const byTs = Date.parse(a.ts) - Date.parse(b.ts);
    if (byTs !== 0) return byTs;
    const aId = BigInt(a.id);
    const bId = BigInt(b.id);
    if (aId < bId) return -1;
    return aId > bId ? 1 : 0;
  });

export const importProject = async (token: string, payload: IProjectExportPayload): Promise<string> => {
  const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
  if (response.status !== 201) throw new Error(`import answered ${response.status}`);
  return response.body.id as string;
};

export const getDocumentIdByName = async (token: string, projectId: string, name: string): Promise<string> => {
  const response = await workflowE2eApi().get(`/projects/${projectId}/tree`).set(workflowE2eAuth(token));
  const body = response.body as { documents: readonly { id: string; name: string }[] };
  const doc = body.documents.find((item) => item.name === name);
  if (!doc) throw new Error(`no document "${name}" in project ${projectId}`);
  return doc.id;
};

// oxlint-disable no-undefined -- `undefined` is the "not yet" signal of the polling helpers.
import { getTelegramCalls, pushTelegramUpdate, queueOpenAiResponse } from '@falang/workflow-mocks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WORKFLOW_E2E_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import {
  AI_ANSWER_MARKER,
  NODE_IDS,
  PROMPT_MARKER,
  buildBotFixture,
  buildFailingAiFixture,
  fetchRunJournal,
  fetchWorkflowJournal,
  getDocumentIdByName,
  importProject,
  newBotIds,
  runKey,
  sortEntries,
  waitForJournal,
  waitForNewRun,
  waitForQuestionMessageId,
  waitForSentText,
} from '../../test-utils/run-journal-e2e-helpers.js';

/**
 * Run journal (ADR 0059 (private) §4 "Verification"), workflow tier: a real Telegram bot (trigger -> log ->
 * `call-ai-text` -> `telegram-question` -> `telegram-send-message`) on the dev stand against the Telegram/OpenAI
 * mocks, then the journal read API. Journal entries are produced asynchronously (~1-2 s after the event), so
 * every assertion polls with a deadline. Run via `npm run test-e2e:workflow`.
 */
describe('run journal (workflow tier)', () => {
  let token = '';
  const projectIds: string[] = [];

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  afterAll(async () => {
    for (const projectId of projectIds) {
      // oxlint-disable-next-line no-await-in-loop -- sequential cleanup.
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  });

  const buildAndStart = async (projectId: string): Promise<void> => {
    const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
    expect(build.status).toBe(202);
    await workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === true;
    }, 60_000);
  };

  const sendMessage = (botToken: string, chatId: number, text: string, messageId: number): Promise<void> =>
    pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' },
        text,
      },
    });

  const pressButton = (botToken: string, chatId: number, messageId: number, data: string): Promise<void> =>
    pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
      callback_query: {
        id: `cbq-${Date.now()}-${messageId}`,
        data,
        message: { message_id: messageId, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'private' } },
      },
    });

  describe('bot with AI + question', () => {
    const ids = newBotIds('flow');
    let projectId = '';
    let documentId = '';
    const knownRuns = new Set<string>();
    let questionsSeen = 0;

    beforeAll(async () => {
      projectId = await importProject(token, buildBotFixture(`Run journal bot ${Date.now()}`, ids));
      projectIds.push(projectId);
      documentId = await getDocumentIdByName(token, projectId, 'onMessage');
      await buildAndStart(projectId);
    }, 120_000);

    it('journals trigger -> log -> ai -> message-out -> user-input -> message-out in order, with node ids; warns on a foreign press', async () => {
      await queueOpenAiResponse(WORKFLOW_E2E_MOCKS_URL, ids.openaiApiKey, AI_ANSWER_MARKER);
      await sendMessage(ids.botToken, 4001, 'hello journal', 100);

      const questionMessageId = await waitForQuestionMessageId(ids.botToken, questionsSeen);
      questionsSeen += 1;

      // A press that references a message the run never asked about: the workflow ignores it and says so.
      await pressButton(ids.botToken, 4001, 9999, 'A');
      // The real press.
      await pressButton(ids.botToken, 4001, questionMessageId, 'B');
      await waitForSentText(ids.botToken, 'Chose B');

      const run = await waitForNewRun(token, projectId, knownRuns);
      knownRuns.add(runKey(run));

      const entries = await waitForJournal(
        token,
        projectId,
        run.workflowId,
        (list) =>
          list.some((e) => e.kind === 'message-out' && e.nodeId === NODE_IDS.replyB) &&
          list.some((e) => e.level === 'warn' && e.kind === 'error'),
      );
      const sorted = sortEntries(entries.filter((entry) => entry.runId === run.runId || entry.runId === null));

      const main = sorted.filter((entry) => entry.kind !== 'error');
      expect(main.map((entry) => entry.kind)).toEqual([
        'trigger',
        'log',
        'ai',
        'message-out',
        'user-input',
        'message-out',
      ]);
      for (const entry of main) {
        expect(entry.documentId).toBe(documentId);
        expect(entry.env).toBe('dev');
        expect(entry.textsStripped).toBe(false);
      }

      const [trigger, log, ai, questionOut, userInput, replyOut] = main;
      expect(trigger.message).toContain('hello journal');
      expect(log.nodeId).toBe(NODE_IDS.log);
      expect(log.message).toContain('processing the request');

      // ai: written by the runner's activity wrapper, node id from the Temporal activity header.
      expect(ai.nodeId).toBe(NODE_IDS.ai);
      expect(ai.vendor).toBe('openai');
      expect(JSON.stringify(ai.data)).toContain(PROMPT_MARKER);
      expect(JSON.stringify(ai.data)).toContain(AI_ANSWER_MARKER);
      expect(typeof ai.data?.model).toBe('string');
      expect(ai.data?.usage).toEqual({ promptTokens: 21, completionTokens: 7, totalTokens: 28 });

      expect(questionOut.nodeId).toBe(NODE_IDS.question);
      expect(questionOut.message).toContain('Pick A or B');
      expect(userInput.nodeId).toBe(NODE_IDS.question);
      expect(userInput.level).toBe('info');
      expect(userInput.message).toContain('B');
      expect(userInput.data?.value).toBe('B');
      expect(replyOut.nodeId).toBe(NODE_IDS.replyB);
      expect(replyOut.message).toContain('Chose B');

      const ignored = sorted.find((entry) => entry.kind === 'error' && entry.level === 'warn');
      expect(ignored?.message).toMatch(/ignored input/i);
      expect(ignored?.documentId).toBe(documentId);

      // The per-run route returns exactly this run's entries (a subset of the per-workflow conversation view).
      const runPage = await fetchRunJournal(token, projectId, run);
      expect(runPage.hasMore).toBe(false);
      expect(runPage.entries.length).toBeGreaterThanOrEqual(main.length);
      for (const entry of runPage.entries) expect(entry.runId).toBe(run.runId);
      const workflowIds = new Set(entries.map((entry) => entry.id));
      for (const entry of runPage.entries) expect(workflowIds.has(entry.id)).toBe(true);
      // Ids come in ascending (cursor) order.
      const idList = runPage.entries.map((entry) => BigInt(entry.id));
      expect(idList).toEqual(idList.toSorted((a, b) => Number(a - b)));
    }, 180_000);

    it('a press on the old question after the run finished does not corrupt the journal', async () => {
      const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, ids.botToken);
      const questionIndex = calls
        .filter((call) => call.method === 'sendMessage')
        .findIndex((call) => (call.body as { reply_markup?: unknown }).reply_markup !== undefined);
      const run = [...knownRuns][0];
      const workflowId = run.split('/')[0];
      const before = await fetchWorkflowJournal(token, projectId, workflowId);

      await pressButton(ids.botToken, 4001, questionIndex + 1, 'A');

      // What actually happens depends on how the gateway routes a callback for a chat with no live run (it may be
      // dropped, or the backend may record an "undeliverable input" entry). Whatever lands must be a warning/error
      // entry, never a rewrite of the finished run's own entries.
      await workflowE2eWaitFor(async () => {
        const after = await fetchWorkflowJournal(token, projectId, workflowId);
        return after.length > before.length;
      }, 12_000).catch(() => null);
      const after = await fetchWorkflowJournal(token, projectId, workflowId);
      const beforeIds = new Set(before.map((entry) => entry.id));
      expect(after.filter((entry) => beforeIds.has(entry.id))).toEqual(before);
      for (const entry of after.filter((item) => !beforeIds.has(item.id))) {
        expect(['warn', 'error']).toContain(entry.level);
      }
    }, 60_000);

    it('storeTexts=false: the next run is journalled with texts stripped', async () => {
      const get = await workflowE2eApi().get(`/projects/${projectId}/journal-settings`).set(workflowE2eAuth(token));
      expect(get.body).toEqual({ storeTexts: true });
      const put = await workflowE2eApi()
        .put(`/projects/${projectId}/journal-settings`)
        .set(workflowE2eAuth(token))
        .send({ storeTexts: false });
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ storeTexts: false });

      await queueOpenAiResponse(WORKFLOW_E2E_MOCKS_URL, ids.openaiApiKey, AI_ANSWER_MARKER);
      await sendMessage(ids.botToken, 4002, 'hello stripped', 200);
      const questionMessageId = await waitForQuestionMessageId(ids.botToken, questionsSeen);
      questionsSeen += 1;
      await pressButton(ids.botToken, 4002, questionMessageId, 'A');
      await waitForSentText(ids.botToken, 'Chose A');

      const run = await waitForNewRun(token, projectId, knownRuns);
      knownRuns.add(runKey(run));
      const snapshot = await waitForJournal(token, projectId, run.workflowId, (list) =>
        list.some((e) => e.runId === run.runId && e.nodeId === NODE_IDS.replyA),
      );
      const entries = snapshot.filter((entry) => entry.runId === run.runId);

      expect(entries.length).toBeGreaterThanOrEqual(6);
      for (const entry of entries) expect(entry.textsStripped).toBe(true);
      const serialized = JSON.stringify(entries);
      for (const secret of [PROMPT_MARKER, AI_ANSWER_MARKER, 'hello stripped', 'Pick A or B', 'Chose A']) {
        expect(serialized).not.toContain(secret);
      }
      // Metadata survives: node ids, kinds, usage and model of the AI call.
      const ai = entries.find((entry) => entry.kind === 'ai');
      expect(ai?.nodeId).toBe(NODE_IDS.ai);
      expect(ai?.data?.usage).toEqual({ promptTokens: 21, completionTokens: 7, totalTokens: 28 });
      expect(typeof ai?.data?.model).toBe('string');
    }, 180_000);
  });

  describe('failing activity', () => {
    it('journals every failed attempt of an activity as an error entry with the node id', async () => {
      const ids = newBotIds('fail');
      const projectId = await importProject(token, buildFailingAiFixture(`Run journal failing ${Date.now()}`, ids));
      projectIds.push(projectId);
      const documentId = await getDocumentIdByName(token, projectId, 'onMessage');
      await buildAndStart(projectId);

      await sendMessage(ids.botToken, 4003, 'trigger a failure', 300);
      const run = await waitForNewRun(token, projectId, new Set());
      const entries = await waitForJournal(token, projectId, run.workflowId, (list) =>
        list.some((entry) => entry.kind === 'error'),
      );

      expect(entries.some((entry) => entry.kind === 'trigger')).toBe(true);
      // ADR 0059 §2b: a failed attempt Temporal will retry is a `warn` (the failure stays retryable here — no
      // `maximumAttempts` — so the run's final `error`-level entry never arrives); each attempt gets its own entry.
      const errors = entries.filter((entry) => entry.kind === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      for (const error of errors) {
        expect(error.level).toBe('warn');
        expect(error.documentId).toBe(documentId);
        expect(error.nodeId).toBe(NODE_IDS.ai);
        expect(error.message.length).toBeGreaterThan(0);
        expect(typeof error.data?.activity).toBe('string');
        expect(typeof error.data?.attempt).toBe('number');
      }
      // The prompt never shows up in an error entry's own data.
      expect(JSON.stringify(errors.map((error) => error.data))).not.toContain(PROMPT_MARKER);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
    }, 150_000);
  });
});

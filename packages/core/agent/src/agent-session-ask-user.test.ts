import { describe, expect, it, vi } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, schemeFactory, TOKEN_HISTORY } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentSession } from './agent-session.js';
import { buildQuestionAnswerText } from './ask-user.js';
import type { ILlmResponse, TLlmMessage } from './llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

const BODY_ID = '2';
const question = { options: [{ label: 'A' }, { label: 'B' }], question: 'Which?' };

const createScheme = (): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule()],
  });

const call = (id: string, name: string, input: unknown): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});

describe('AgentSession ask_user', () => {
  it('ends awaiting-answer, then continues from pendingMessages', async () => {
    const scheme = createScheme();
    const snapshots: TLlmMessage[][] = [];
    const client = new ScriptedLlmClient([
      call('t1', 'ask_user', question),
      (params): ILlmResponse => {
        snapshots.push([...params.messages]);
        return call('t2', 'finish', { message: 'ok' });
      },
    ]);
    const session = new AgentSession(scheme, client, []);

    await session.run('build');
    expect(session.status).toBe('awaiting-answer');
    expect(session.message).toBe('');
    expect(session.question).toEqual({ allowOther: true, options: question.options, question: 'Which?' });
    const pending = session.pendingMessages;
    expect(pending).toHaveLength(3);
    const last = pending?.at(-1);
    expect(last?.role === 'tool' && last.results[0].toolCallId).toBe('t1');

    await session.run(buildQuestionAnswerText({ option: 'A' }), { priorMessages: pending ?? [] });
    expect(session.status).toBe('done');
    expect(session.question).toBeNull();
    expect(session.pendingMessages).toBeNull();
    expect(snapshots[0]).toHaveLength(4);
    expect(snapshots[0][3]).toEqual({ content: 'Answer: A', role: 'user' });
  });

  it('keeps earlier steps applied and closes the undo group', async () => {
    const scheme = createScheme();
    const onRunFinished = vi.fn();
    const client = new ScriptedLlmClient([
      call('t1', 'insert_node', { index: 0, name: 'action', parentId: BODY_ID }),
      call('t2', 'ask_user', question),
    ]);
    const session = new AgentSession(scheme, client, [], { onRunFinished });
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    await session.run('build');
    expect(session.status).toBe('awaiting-answer');
    expect(onRunFinished).toHaveBeenCalledTimes(1);
    expect(scheme.nodes.getNode(BODY_ID).children).toHaveLength(1);
    history.back();
    expect(scheme.nodes.getNode(BODY_ID).children).toHaveLength(0);
  });

  it('does not offer ask_user past the cap or when disallowed', async () => {
    const run = async (options: object): Promise<{ tools: string[]; system: string }> => {
      const client = new ScriptedLlmClient([call('t1', 'finish', { message: 'x' })]);
      await new AgentSession(createScheme(), client, []).run('go', options);
      return { system: client.requests[0].system, tools: client.requests[0].tools.map((tool) => tool.name) };
    };
    const normal = await run({});
    expect(normal.tools).toContain('ask_user');
    const capped = await run({ consecutiveQuestions: 3 });
    expect(capped.tools).not.toContain('ask_user');
    expect(capped.system).toContain('decide yourself now');
    const off = await run({ allowQuestions: false });
    expect(off.tools).not.toContain('ask_user');
    expect(off.system).toContain("Don't ask");
  });

  it('bounces an invalid ask_user and continues', async () => {
    const client = new ScriptedLlmClient([
      call('t1', 'ask_user', { options: [{ label: 'A' }], question: 'Which?' }),
      call('t2', 'finish', { message: 'ok' }),
    ]);
    const session = new AgentSession(createScheme(), client, []);
    await session.run('go');
    expect(session.status).toBe('done');
    expect(session.steps[0].result.ok).toBe(false);
    expect(session.question).toBeNull();
  });

  it('rejects ask_user when it was not offered and continues', async () => {
    const client = new ScriptedLlmClient([call('t1', 'ask_user', question), call('t2', 'finish', { message: 'ok' })]);
    const session = new AgentSession(createScheme(), client, []);
    await session.run('go', { allowQuestions: false });
    expect(session.status).toBe('done');
    expect(session.question).toBeNull();
    const first = session.steps[0].result;
    expect(!first.ok && first.error).toContain('not available');
  });

  it('ask_user wins over finish in the same response', async () => {
    const client = new ScriptedLlmClient([
      {
        text: '',
        toolCalls: [
          { id: 't1', input: { message: 'x' }, name: 'finish' },
          { id: 't2', input: question, name: 'ask_user' },
        ],
      },
    ]);
    const session = new AgentSession(createScheme(), client, []);
    await session.run('go');
    expect(session.status).toBe('awaiting-answer');
    expect(session.message).toBe('');
  });
});

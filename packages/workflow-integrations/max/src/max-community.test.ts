// oxlint-disable max-lines, no-new-func, init-declarations, typescript-eslint/no-non-null-assertion -- routing, member events and moderation activities of ADR 0076 (private) in one suite.
import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMaxBackend } from './max-backend.js';
import { toMaxMemberEvent } from './max-member-events.js';
import { maxDeleteMessageAction, maxRemoveMemberAction, MAX_MODERATION_SHARED_CODE } from './max-moderation-actions.js';

const SECRET = 'test-webhook-secret-0123456789abcdefghijklmnop';
const ann = { user_id: 7, first_name: 'Ann', last_name: null, username: 'ann', is_bot: false };

const doc = (id: string, triggerName: string, triggerConfig?: Record<string, string>): IIntegrationDocumentRecord => {
  const root: INode = {
    id: `root-${id}`,
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: `h-${id}`, name: 'function-header', data: '' },
      {
        id: `b-${id}`,
        name: 'trigger-function-body',
        children: [],
        data: { vendor: 'max', triggerName, credentialId: 'cred-1', triggerConfig },
      },
      { id: `f-${id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id, name: `fn_${id}`, data: null, root };
};

type TCtx = IIntegrationBackendContext & { webhook?: (request: Request) => Promise<Response> };

const buildCtx = (docs: IIntegrationDocumentRecord[]): TCtx => {
  const ctx: TCtx = {
    vendor: 'max',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { botToken: 'bot-token' },
    webhookUrl: 'https://bots.example.com/hook',
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn((_uri: string, handler: (request: Request) => Promise<Response>) => {
      ctx.webhook = handler;
    }),
    deriveSecret: () => SECRET,
    registerInterval: vi.fn(),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue(docs),
    getInternalProjectToken: vi.fn().mockReturnValue('t'),
    upsertSchedule: vi.fn(),
    pauseSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn(),
    reportJournalProblem: vi.fn().mockResolvedValue(null),
  };
  return ctx;
};

const deliver = async (ctx: TCtx, update: unknown): Promise<void> => {
  if (!ctx.webhook) await registerMaxBackend(ctx);
  await ctx.webhook?.(
    new Request('https://bots.example.com/hook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-max-bot-api-secret': SECRET },
      body: JSON.stringify(update),
    }),
  );
};

const message = (text: string, chatType: string, chatId: number, mid = 'mid.1', sender = ann) => ({
  update_type: 'message_created',
  timestamp: 1000,
  message: {
    sender,
    recipient: { chat_id: chatId, chat_type: chatType, user_id: null },
    timestamp: 1000,
    body: { mid, seq: 1, text, attachments: null },
  },
});

const calls = (ctx: TCtx) => vi.mocked(ctx.signalWorkflow).mock.calls.map((call) => call[0]);

describe('max community routing', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('routes by the chatType filter: dialog -> private, chat and channel -> group', async () => {
    const docs = [
      doc('priv', 'max-trigger', { chatType: 'private' }),
      doc('grp', 'max-trigger', { chatType: 'group' }),
    ];
    const ctx = buildCtx(docs);
    await deliver(ctx, message('a', 'dialog', 1));
    await deliver(ctx, message('b', 'chat', 2));
    await deliver(ctx, message('c', 'channel', 3));
    expect(calls(ctx).map((call) => call.workflowType)).toEqual(['fn_priv', 'fn_grp', 'fn_grp']);
  });

  it('a command document with a filter that rejects the chat falls through to the on-message document', async () => {
    const docs = [
      doc('cmd', 'max-on-command-trigger', { command: 'start', chatType: 'private' }),
      doc('any', 'max-trigger'),
    ];
    const ctx = buildCtx(docs);
    await deliver(ctx, message('/start', 'chat', 2));
    await deliver(ctx, message('/start', 'dialog', 3));
    expect(calls(ctx).map((call) => call.workflowType)).toEqual(['fn_any', 'fn_cmd']);
  });

  it('journals a message whose chat no filter admits', async () => {
    const ctx = buildCtx([doc('priv', 'max-trigger', { chatType: 'private' })]);
    await deliver(ctx, message('hi', 'chat', 9));
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'max-unbound-9' }));
  });

  it('builds workflow ids by conversation mode', async () => {
    const perUser = buildCtx([doc('u', 'max-trigger', { conversation: 'per-user' })]);
    await deliver(perUser, message('hi', 'chat', 5));
    expect(calls(perUser)[0].workflowId).toBe('max-u-5-7');

    const perEvent = buildCtx([doc('e', 'max-trigger', { conversation: 'per-event' })]);
    await deliver(perEvent, message('hi', 'chat', 5, 'mid.77'));
    expect(calls(perEvent)[0].workflowId).toBe('max-e-5-1000-mid.77');
  });

  const press = (chatType: string, chatId: number) => ({
    update_type: 'message_callback',
    timestamp: 2000,
    callback: { callback_id: 'cb', payload: 'Yes', user: ann },
    message: { ...message('Q?', chatType, chatId).message, body: { mid: 'mid.q', text: 'Q?' } },
  });

  it('remembers the full workflow id: a button in a per-user private chat reaches the same run', async () => {
    const ctx = buildCtx([doc('u', 'max-trigger', { conversation: 'per-user' })]);
    await deliver(ctx, message('hi', 'dialog', 5));
    await deliver(ctx, press('dialog', 5));
    const [first, answer] = calls(ctx);
    expect(answer.workflowId).toBe(first.workflowId);
    expect(answer.signalName).toBe('maxQuestionAnswer');
  });

  it('does not signal a button pressed in a group for a per-user conversation, but journals a warning', async () => {
    const ctx = buildCtx([doc('u', 'max-trigger', { conversation: 'per-user', chatType: 'group' })]);
    await deliver(ctx, message('hi', 'chat', 5));
    await deliver(ctx, press('chat', 5));
    expect(calls(ctx)).toHaveLength(1);
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        data: expect.objectContaining({ errorType: 'UnroutableGroupAnswer' }),
      }),
    );
  });

  it('a button in a group still routes for a per-chat conversation', async () => {
    const ctx = buildCtx([doc('c', 'max-trigger')]);
    await deliver(ctx, message('hi', 'chat', 5));
    await deliver(ctx, press('chat', 5));
    expect(calls(ctx).map((call) => call.workflowId)).toEqual(['max-c-5', 'max-c-5']);
  });

  it('after a restart (empty map) a private press falls back to an id built by the document mode', async () => {
    const ctx = buildCtx([doc('u', 'max-trigger', { conversation: 'per-user' })]);
    await deliver(ctx, press('dialog', 5));
    expect(calls(ctx)[0].workflowId).toBe('max-u-5-7');
  });
});

describe('max member events', () => {
  const added = {
    update_type: 'user_added',
    timestamp: 5000,
    chat_id: 11,
    user: ann,
    inviter_id: 3,
    is_channel: false,
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('maps user_added and user_removed to the camelCase max/MemberEvent', () => {
    expect(toMaxMemberEvent(added as never)).toEqual({
      chat: { id: 11, isChannel: false },
      user: { id: 7, isBot: false, firstName: 'Ann', username: 'ann' },
      byId: 3,
      date: 5000,
    });
    const removed = toMaxMemberEvent({
      update_type: 'user_removed',
      timestamp: 6000,
      chat_id: 11,
      user: ann,
      admin_id: null,
      is_channel: true,
    });
    expect(removed.byId).toBeUndefined();
    expect(removed.chat.isChannel).toBe(true);
  });

  it('signals every bound member-joined trigger with its own per-event workflow id', async () => {
    const ctx = buildCtx([doc('j', 'max-member-joined'), doc('l', 'max-member-left'), doc('m', 'max-trigger')]);
    await deliver(ctx, added);
    expect(calls(ctx)).toEqual([
      expect.objectContaining({
        workflowId: 'max-j-11-7-5000',
        workflowType: 'fn_j',
        signalName: 'maxMemberJoined',
        signalArgs: [expect.objectContaining({ byId: 3, user: expect.objectContaining({ id: 7 }) })],
      }),
    ]);
  });

  it('user_removed goes to member-left only', async () => {
    const ctx = buildCtx([doc('j', 'max-member-joined'), doc('l', 'max-member-left')]);
    await deliver(ctx, { update_type: 'user_removed', timestamp: 6000, chat_id: 11, user: ann, admin_id: 3 });
    expect(calls(ctx).map((call) => [call.workflowType, call.signalName])).toEqual([['fn_l', 'maxMemberLeft']]);
  });

  it('journals an info problem when no member trigger is bound', async () => {
    const ctx = buildCtx([doc('m', 'max-trigger')]);
    await deliver(ctx, added);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'info', workflowId: 'max-unbound-11' }),
    );
  });

  it('bot_added and bot_removed only write an info journal line under max-unbound-<chatId>', async () => {
    const ctx = buildCtx([doc('j', 'max-member-joined')]);
    await deliver(ctx, { update_type: 'bot_added', timestamp: 1, chat_id: 12, user: ann, is_channel: false });
    await deliver(ctx, { update_type: 'bot_removed', timestamp: 2, chat_id: 12, user: ann, is_channel: false });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.reportJournalProblem!).mock.calls.map((call) => [call[0].workflowId, call[0].level])).toEqual([
      ['max-unbound-12', 'info'],
      ['max-unbound-12', 'info'],
    ]);
  });
});

describe('max moderation activities', () => {
  /** Compiles the generated activity code (shared helper + action) and returns the exported function. */
  const load = (activityCode: string, name: string): ((...args: unknown[]) => Promise<void>) => {
    const source = [
      'const resolveMaxBotToken = async () => ({ token: "tok", apiBaseUrl: "https://max.test" });',
      MAX_MODERATION_SHARED_CODE,
      activityCode.replace(/^export /m, ''),
      `return ${name};`,
    ].join('\n');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function('fetch', js)(globalThis.fetch) as (...args: unknown[]) => Promise<void>;
  };

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, body: unknown): void => {
    fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
  };

  const removeMember = () => load(maxRemoveMemberAction.activityCode, 'maxRemoveMember');
  const deleteMessage = () => load(maxDeleteMessageAction.activityCode, 'maxDeleteMessage');

  it('remove-member calls DELETE /chats/{id}/members with user_id and block', async () => {
    answer(200, { success: true });
    await removeMember()('cred', 11, 7, true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/chats/11/members');
    expect(url.searchParams.get('user_id')).toBe('7');
    expect(url.searchParams.get('block')).toBe('true');
    expect(init.headers).toMatchObject({ Authorization: 'tok' });
  });

  it('delete-message calls DELETE /messages?message_id=', async () => {
    answer(200, { success: true });
    await deleteMessage()('cred', 'mid.1');
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe('/messages');
    expect(url.searchParams.get('message_id')).toBe('mid.1');
  });

  it('treats HTTP 404 and "not a member" / "not found" as success', async () => {
    answer(404, { code: 'not.found' });
    await expect(removeMember()('cred', 11, 7, true)).resolves.toBeUndefined();
    answer(200, { success: false, message: 'User is not a member of this chat' });
    await expect(removeMember()('cred', 11, 7, true)).resolves.toBeUndefined();
    answer(200, { success: false, message: 'Message not found' });
    await expect(deleteMessage()('cred', 'mid.1')).resolves.toBeUndefined();
  });

  it('throws with the platform message on success:false and with the body on HTTP errors', async () => {
    answer(200, { success: false, message: 'no permission' });
    await expect(removeMember()('cred', 11, 7, false)).rejects.toThrow(/no permission/);
    answer(403, { code: 'forbidden', message: 'denied' });
    await expect(deleteMessage()('cred', 'mid.1')).rejects.toThrow(/403.*denied/);
    answer(500, 'boom');
    await expect(deleteMessage()('cred', 'mid.1')).rejects.toThrow(/500/);
  });

  it('declares three attempts and the emitted call matches the signature', () => {
    for (const action of [maxRemoveMemberAction, maxDeleteMessageAction]) {
      expect(action.activityOptions?.retry?.maximumAttempts).toBe(3);
    }
    expect(maxRemoveMemberAction.emit({ credentialId: 'c', chatId: '1', userId: '2', block: 'true' })).toBe(
      'await maxRemoveMember(c, 1, 2, true);',
    );
  });
});

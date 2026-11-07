import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';
import {
  buildCommunityCtx,
  groupMessage,
  jsonResponse,
  postUpdate,
  privateMessage,
  triggerDoc,
} from './telegram-community-test-helpers.js';

const button = (chat: { id: number; type: string }, messageId = 5, fromId = 7): unknown => ({
  update_id: 99,
  callback_query: {
    id: 'cbq',
    data: 'A',
    from: { id: fromId, is_bot: false, first_name: 'Bob' },
    message: { message_id: messageId, date: 0, chat },
  },
});

describe('telegram routing: chatType filter and conversation modes (ADR 0076 (private))', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes group and private messages to the on-message documents whose chatType admits them', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({
        id: 'priv',
        name: 'onPrivate',
        triggerName: 'telegram-trigger',
        triggerConfig: { chatType: 'private' },
      }),
      triggerDoc({ id: 'grp', name: 'onGroup', triggerName: 'telegram-trigger', triggerConfig: { chatType: 'group' } }),
    ]);
    await registerTelegramBackend(ctx);

    await postUpdate(ctx, { update_id: 1, message: privateMessage('hi') });
    await postUpdate(ctx, { update_id: 2, message: groupMessage('hello') });

    expect(ctx.signalWorkflow).toHaveBeenNthCalledWith(1, expect.objectContaining({ workflowId: 'tg-priv-42' }));
    expect(ctx.signalWorkflow).toHaveBeenNthCalledWith(2, expect.objectContaining({ workflowId: 'tg-grp--100' }));
  });

  it('treats supergroup, group and channel as a group, and an absent chatType as any', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({ id: 'grp', name: 'onGroup', triggerName: 'telegram-trigger', triggerConfig: { chatType: 'group' } }),
    ]);
    await registerTelegramBackend(ctx);
    for (const [index, type] of ['group', 'supergroup', 'channel'].entries()) {
      await postUpdate(ctx, { update_id: index, message: { ...groupMessage('x'), chat: { id: -5, type } } });
    }
    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(3);

    const anyCtx = buildCommunityCtx([triggerDoc({ id: 'any', name: 'onAny', triggerName: 'telegram-trigger' })]);
    await registerTelegramBackend(anyCtx);
    await postUpdate(anyCtx, { update_id: 1, message: groupMessage('x') });
    expect(anyCtx.signalWorkflow).toHaveBeenCalledTimes(1);
  });

  it('journals an ignored message when no document admits the chat type', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({
        id: 'priv',
        name: 'onPrivate',
        triggerName: 'telegram-trigger',
        triggerConfig: { chatType: 'private' },
      }),
    ]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 1, message: groupMessage('x') });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'tg-unbound--100',
        data: expect.objectContaining({ errorType: 'NoBoundTrigger' }),
      }),
    );
  });

  it('applies the chatType filter to a command trigger too, keeping command priority', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({ id: 'msg', name: 'onMessage', triggerName: 'telegram-trigger' }),
      triggerDoc({
        id: 'cmd-priv',
        name: 'onStartPrivate',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: 'start', chatType: 'private' },
      }),
    ]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 1, message: privateMessage('/start') });
    await postUpdate(ctx, { update_id: 2, message: groupMessage('/start') });
    expect(ctx.signalWorkflow).toHaveBeenNthCalledWith(1, expect.objectContaining({ workflowId: 'tg-cmd-priv-42' }));
    expect(ctx.signalWorkflow).toHaveBeenNthCalledWith(2, expect.objectContaining({ workflowId: 'tg-msg--100' }));
  });

  it.each([
    ['per-chat', 'tg-doc--100'],
    ['per-user', 'tg-doc--100-7'],
    ['per-event', 'tg-doc--100-1'],
  ])('keys the workflow id of a group message by conversation mode %s', async (conversation, workflowId) => {
    const ctx = buildCommunityCtx([
      triggerDoc({ id: 'doc', name: 'onMessage', triggerName: 'telegram-trigger', triggerConfig: { conversation } }),
    ]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 1, message: groupMessage('x') });
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId }));
  });

  it('routes a button in a per-user private chat to the same run via the remembered full workflow id', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({
        id: 'doc',
        name: 'onMessage',
        triggerName: 'telegram-trigger',
        triggerConfig: { conversation: 'per-user' },
      }),
    ]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 1, message: privateMessage('hi') });
    await postUpdate(ctx, button({ id: 42, type: 'private' }, 5, 42));
    expect(ctx.signalWorkflow).toHaveBeenLastCalledWith({
      workflowId: 'tg-doc-42-42',
      workflowType: 'onMessage',
      signalName: 'telegramQuestionAnswer',
      signalArgs: [{ messageId: '5', value: 'A' }],
    });
  });

  it('routes a button in a per-event private chat to the latest run of that chat', async () => {
    const ctx = buildCommunityCtx([
      triggerDoc({
        id: 'doc',
        name: 'onMessage',
        triggerName: 'telegram-trigger',
        triggerConfig: { conversation: 'per-event' },
      }),
    ]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 10, message: privateMessage('hi') });
    await postUpdate(ctx, button({ id: 42, type: 'private' }));
    expect(ctx.signalWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({ workflowId: 'tg-doc-42-10', signalName: 'telegramQuestionAnswer' }),
    );
  });

  it('still routes a button in a per-chat group to the shared run', async () => {
    const ctx = buildCommunityCtx([triggerDoc({ id: 'doc', name: 'onMessage', triggerName: 'telegram-trigger' })]);
    await registerTelegramBackend(ctx);
    await postUpdate(ctx, { update_id: 1, message: groupMessage('x') });
    await postUpdate(ctx, button({ id: -100, type: 'supergroup' }));
    expect(ctx.signalWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({ workflowId: 'tg-doc--100', signalName: 'telegramQuestionAnswer' }),
    );
  });

  it.each(['per-user', 'per-event'])(
    'does not signal a button pressed in a group in %s mode; it journals UnroutableGroupAnswer',
    async (conversation) => {
      const ctx = buildCommunityCtx([
        triggerDoc({ id: 'doc', name: 'onMessage', triggerName: 'telegram-trigger', triggerConfig: { conversation } }),
      ]);
      await registerTelegramBackend(ctx);
      await postUpdate(ctx, { update_id: 1, message: groupMessage('x') });
      vi.mocked(ctx.signalWorkflow).mockClear();
      await postUpdate(ctx, button({ id: -100, type: 'supergroup' }));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          data: expect.objectContaining({ errorType: 'UnroutableGroupAnswer' }),
        }),
      );
    },
  );

  it('after a restart (no memory) rebuilds the id from the document mode: private per-user ok, per-event journaled', async () => {
    const perUser = buildCommunityCtx([
      triggerDoc({
        id: 'doc',
        name: 'onMessage',
        triggerName: 'telegram-trigger',
        triggerConfig: { conversation: 'per-user' },
      }),
    ]);
    await registerTelegramBackend(perUser);
    await postUpdate(perUser, button({ id: 42, type: 'private' }, 5, 42));
    expect(perUser.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'tg-doc-42-42' }));

    const perEvent = buildCommunityCtx([
      triggerDoc({
        id: 'doc',
        name: 'onMessage',
        triggerName: 'telegram-trigger',
        triggerConfig: { conversation: 'per-event' },
      }),
    ]);
    await registerTelegramBackend(perEvent);
    await postUpdate(perEvent, button({ id: 42, type: 'private' }));
    expect(perEvent.signalWorkflow).not.toHaveBeenCalled();
    expect(perEvent.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorType: 'UnroutableAnswer' }) }),
    );
  });

  describe('allowed_updates', () => {
    const ALLOWED = ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request'];

    it('is sent explicitly in setWebhook', async () => {
      const ctx = buildCommunityCtx([]);
      await registerTelegramBackend(ctx);
      const call = fetchMock.mock.calls.find((args) => String(args[0]).includes('setWebhook')) as [string, RequestInit];
      expect(JSON.parse(call[1].body as string)).toMatchObject({ allowed_updates: ALLOWED });
    });

    it('is sent explicitly in every getUpdates poll', async () => {
      const ctx = buildCommunityCtx([]);
      (ctx as { webhookUrl?: string }).webhookUrl = undefined;
      await registerTelegramBackend(ctx);
      const poll = vi.mocked(ctx.registerInterval).mock.calls[0][0] as () => Promise<void>;
      await poll();
      const call = fetchMock.mock.calls.find((args) => String(args[0]).includes('getUpdates')) as [URL];
      expect(JSON.parse(new URL(call[0]).searchParams.get('allowed_updates') ?? 'null')).toEqual(ALLOWED);
    });
  });
});

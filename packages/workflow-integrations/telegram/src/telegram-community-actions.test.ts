import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { telegramCommunityActions, TELEGRAM_MODERATION_SHARED_CODE } from './telegram-community-actions.js';
import { telegramIntegration } from './telegram.integration.js';

type TActivity = (...args: unknown[]) => Promise<unknown>;

/** Compiles the generated activity source (shared helper + one action) and runs it against a fake `fetch`. */
const loadActivity = (name: string, fetchMock: ReturnType<typeof vi.fn>): TActivity => {
  const action = telegramCommunityActions.find((candidate) => candidate.activityCode.includes(`export const ${name} `));
  if (!action) throw new Error(`no action defines ${name}`);
  const source = [
    "const resolveTelegramBotToken = async (_credentialId: string) => ({ token: 'tok', apiBaseUrl: 'http://api' });",
    TELEGRAM_MODERATION_SHARED_CODE,
    action.activityCode,
    `exports.${name} = ${name};`,
  ].join('\n');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports: Record<string, TActivity> = {};
  new Function('exports', 'fetch', outputText)(exports, fetchMock);
  return exports[name];
};

const ok = (result: unknown = true): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, result }) }) as Response;
const fail = (description: string, status = 400): Response =>
  ({ ok: false, status, text: () => Promise.resolve(JSON.stringify({ ok: false, description })) }) as Response;

const lastCall = (fetchMock: ReturnType<typeof vi.fn>): { url: string; body: Record<string, unknown> } => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
};

describe('telegram moderation activities', () => {
  it('banChatMember: sends until_date only when set and revoke_messages only when true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    const ban = loadActivity('telegramBanMember', fetchMock);
    await ban('cred', -100, 7, 0, false);
    expect(lastCall(fetchMock)).toEqual({
      url: 'http://api/bottok/banChatMember',
      body: { chat_id: -100, user_id: 7 },
    });
    await ban('cred', -100, 7, 1_800_000_000, true);
    expect(lastCall(fetchMock).body).toEqual({
      chat_id: -100,
      user_id: 7,
      until_date: 1_800_000_000,
      revoke_messages: true,
    });
  });

  it('unbanChatMember: only_if_banned is always true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    await loadActivity('telegramUnbanMember', fetchMock)('cred', -100, 7);
    expect(lastCall(fetchMock)).toEqual({
      url: 'http://api/bottok/unbanChatMember',
      body: { chat_id: -100, user_id: 7, only_if_banned: true },
    });
  });

  it('deleteMessage: success, "not found" and "can\'t be deleted" are no-ops, anything else throws with the description', async () => {
    const fetchMock = vi.fn();
    const del = loadActivity('telegramDeleteMessage', fetchMock);
    fetchMock.mockResolvedValueOnce(ok());
    await expect(del('cred', -100, 9)).resolves.toBeUndefined();
    expect(lastCall(fetchMock).body).toEqual({ chat_id: -100, message_id: 9 });
    fetchMock.mockResolvedValueOnce(fail('Bad Request: message to delete not found'));
    await expect(del('cred', -100, 9)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(fail("Bad Request: message can't be deleted"));
    await expect(del('cred', -100, 9)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(fail('Forbidden: not enough rights to delete a message', 403));
    await expect(del('cred', -100, 9)).rejects.toThrow('403 Forbidden: not enough rights to delete a message');
  });

  it.each([
    ['telegramApproveJoinRequest', 'approveChatJoinRequest'],
    ['telegramDeclineJoinRequest', 'declineChatJoinRequest'],
  ])('%s: calls %s; an already-handled request is a no-op, other errors throw', async (name, method) => {
    const fetchMock = vi.fn();
    const activity = loadActivity(name, fetchMock);
    fetchMock.mockResolvedValueOnce(ok());
    await activity('cred', -100, 7);
    expect(lastCall(fetchMock)).toEqual({ url: `http://api/bottok/${method}`, body: { chat_id: -100, user_id: 7 } });
    fetchMock.mockResolvedValueOnce(fail('Bad Request: USER_ALREADY_PARTICIPANT'));
    await expect(activity('cred', -100, 7)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(fail('Bad Request: HIDE_REQUESTER_MISSING'));
    await expect(activity('cred', -100, 7)).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(fail('Bad Request: not enough rights'));
    await expect(activity('cred', -100, 7)).rejects.toThrow('not enough rights');
  });

  it('getChatMember: maps the member to { status, user, isAdmin }', async () => {
    const fetchMock = vi.fn();
    const get = loadActivity('telegramGetMember', fetchMock);
    const raw = (status: string): Response => ok({ status, user: { id: 7, is_bot: false, first_name: 'Bob' } });
    fetchMock.mockResolvedValueOnce(raw('administrator'));
    expect(await get('cred', -100, 7)).toEqual({
      status: 'administrator',
      user: { id: 7, isBot: false, firstName: 'Bob', username: undefined },
      isAdmin: true,
    });
    fetchMock.mockResolvedValueOnce(raw('member'));
    expect(await get('cred', -100, 7)).toMatchObject({ status: 'member', isAdmin: false });
    fetchMock.mockResolvedValueOnce(raw('creator'));
    expect(await get('cred', -100, 7)).toMatchObject({ isAdmin: true });
    fetchMock.mockResolvedValueOnce(fail('Bad Request: user not found'));
    await expect(get('cred', -100, 7)).rejects.toThrow('user not found');
  });
});

describe('telegram community descriptors', () => {
  it('registers six actions and three member triggers with their own signals', () => {
    expect(telegramCommunityActions.map((action) => action.name)).toEqual([
      'telegram-ban-member',
      'telegram-unban-member',
      'telegram-delete-message',
      'telegram-approve-join-request',
      'telegram-decline-join-request',
      'telegram-get-member',
    ]);
    const triggers = telegramIntegration.triggers ?? [];
    const member = triggers.filter((trigger) => /member|join-request/.test(trigger.name));
    expect(member.map((trigger) => [trigger.name, trigger.delivery ?? 'signal', trigger.signalName])).toEqual([
      ['telegram-member-joined', 'signal', 'telegramMemberJoined'],
      ['telegram-member-left', 'signal', 'telegramMemberLeft'],
      ['telegram-join-request', 'signal', 'telegramJoinRequest'],
    ]);
    expect(member.map((trigger) => trigger.scopeVariableName)).toEqual(['event', 'event', 'request']);
  });

  it('gives both on-message triggers the chatType and conversation select fields', () => {
    for (const name of ['telegram-trigger', 'telegram-on-command-trigger']) {
      const trigger = (telegramIntegration.triggers ?? []).find((candidate) => candidate.name === name);
      expect(trigger?.contextFields?.map((field) => field.name)).toEqual(
        expect.arrayContaining(['chatType', 'conversation']),
      );
      expect(trigger?.notes).toContain('per-event');
      expect(trigger?.notes).toContain('chatType');
    }
  });

  it('keeps the vendor notes searchable by moderation keywords', () => {
    for (const word of ['moderation', 'ban', 'kick', 'group', 'community', 'member', 'join request', 'admin']) {
      expect(telegramIntegration.notes.toLowerCase()).toContain(word);
    }
  });
});

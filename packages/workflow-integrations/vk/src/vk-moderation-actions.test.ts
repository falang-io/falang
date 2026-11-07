import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vkDeleteMessageAction, vkKickFromChatAction } from './vk-moderation-actions.js';
import { VK_SHARED_ACTIVITY_CODE } from './vk-shared-activity-code.js';

type TActivity = (...args: unknown[]) => Promise<void>;

/** Runs the real generated activity code (shared helpers + the action's), transpiled, against a stubbed `fetch`. */
const loadActivities = (...codes: string[]): Record<string, TActivity> => {
  const shared = VK_SHARED_ACTIVITY_CODE.split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  const js = ts.transpileModule([shared, ...codes].join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, TActivity> = {};
  // oxlint-disable-next-line no-new-func -- runs the generated activity code, which is the point of this test.
  new Function('exports', 'process', 'fetch', 'VkActivityContext', 'vkReadFileBytes', js)(
    exports,
    { env: process.env },
    fetch,
    { current: () => ({ info: {} }) },
    vi.fn(),
  );
  return exports;
};

interface ICall {
  readonly method: string;
  readonly params: Record<string, string>;
}

describe('VK moderation actions', () => {
  let calls: ICall[] = [];
  /** method -> the VK error code to answer with (otherwise success). */
  let failWith: Record<string, number> = {};

  beforeEach(() => {
    calls = [];
    failWith = {};
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'token');
    vi.stubEnv('PROJECT_ID', 'p1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (String(url).endsWith('/internal/credentials/resolve')) return Response.json({ value: 'vk-key' });
        const method = String(url).split('/method/')[1].split('?')[0];
        calls.push({ method, params: Object.fromEntries(new URLSearchParams(String(init?.body ?? ''))) });
        if (failWith[method]) {
          return Response.json({ error: { error_code: failWith[method], error_msg: `error ${failWith[method]}` } });
        }
        if (method === 'groups.getById') return Response.json({ response: { groups: [{ id: 77 }] } });
        return Response.json({ response: 1 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('vk-kick-from-chat', () => {
    const run = (chatId: number) =>
      loadActivities(vkKickFromChatAction.activityCode).vkKickFromChat('cred-1', chatId, 5);

    it('subtracts the conversation offset and kicks by member_id', async () => {
      await run(2_000_000_003);
      expect(calls).toEqual([{ method: 'messages.removeChatUser', params: { chat_id: '3', member_id: '5' } }]);
    });

    it('treats "user is not in the chat" (935) as success', async () => {
      failWith['messages.removeChatUser'] = 935;
      await expect(run(2_000_000_003)).resolves.toBeUndefined();
    });

    it.each([925, 936, 945, 946, 983, 984, 1017])('throws on error %i', async (code) => {
      failWith['messages.removeChatUser'] = code;
      await expect(run(2_000_000_003)).rejects.toThrow(`failed: ${code}`);
    });

    it('refuses a private peer_id without calling VK', async () => {
      await expect(run(42)).rejects.toThrow('conversation peer_id');
      expect(calls).toEqual([]);
    });
  });

  describe('vk-delete-message', () => {
    const run = () => loadActivities(vkDeleteMessageAction.activityCode).vkDeleteMessage('cred-1', 2_000_000_003, 8);

    it('deletes for everybody by conversation message id, with the community id', async () => {
      await run();
      expect(calls.at(-1)).toEqual({
        method: 'messages.delete',
        params: { peer_id: '2000000003', cmids: '8', delete_for_all: '1', group_id: '77' },
      });
    });

    it('treats "chat does not exist" (927) as success', async () => {
      failWith['messages.delete'] = 927;
      await expect(run()).resolves.toBeUndefined();
    });

    it.each([924, 15, 7])('throws on error %i', async (code) => {
      failWith['messages.delete'] = code;
      await expect(run()).rejects.toThrow(`failed: ${code}`);
    });
  });

  it('call sites pass the fields straight through and retry at most 3 times', () => {
    expect(vkKickFromChatAction.emit({ credentialId: "'c'", chatId: 'a', userId: 'b' })).toBe(
      "await vkKickFromChat('c', a, b);",
    );
    expect(vkDeleteMessageAction.emit({ credentialId: "'c'", chatId: 'a', messageId: 'b' })).toBe(
      "await vkDeleteMessage('c', a, b);",
    );
    expect(vkKickFromChatAction.activityOptions?.retry?.maximumAttempts).toBe(3);
    expect(vkDeleteMessageAction.activityOptions?.retry?.maximumAttempts).toBe(3);
  });
});

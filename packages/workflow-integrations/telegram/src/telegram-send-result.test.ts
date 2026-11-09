// oxlint-disable no-new-func -- the generated activity code is compiled and run here, like max-community.test.ts does.
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TELEGRAM_SEND_BUTTONS_NAME, TELEGRAM_SEND_FILE_NAME, TELEGRAM_SEND_MESSAGE_NAME } from './constants.js';
import { telegramIntegration } from './telegram.integration.js';

type TSend = (...args: unknown[]) => Promise<unknown>;

const action = (name: string): IActionDescriptor => {
  const found = telegramIntegration.actions.find((item) => item.name === name);
  if (!found) throw new Error(`no action ${name}`);
  return found;
};

/** Compiles the vendor's shared activity code plus one action's activity and returns the exported function. */
const load = (name: string, exportName: string): TSend => {
  const shared = (telegramIntegration.sharedActivityCode ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  const source = [
    'const telegramReadFileBytes = async () => new Uint8Array([1, 2, 3]);',
    shared,
    action(name).activityCode.replace(/^export /m, ''),
    `return ${exportName};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const env = { BACKEND_INTERNAL_URL: 'http://backend', INTERNAL_PROJECT_TOKEN: 't', PROJECT_ID: 'p' };
  return new Function('fetch', 'process', js)(globalThis.fetch, { env }) as TSend;
};

const forbidden = (description: string): Response =>
  Response.json({ ok: false, error_code: 403, description }, { status: 403 });

describe('telegram send actions report a disabled bot', () => {
  let answers: Response[] = [];
  beforeEach(() => {
    answers = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) =>
        String(url).includes('/internal/credentials/resolve')
          ? Response.json({ value: 'tok', apiBaseUrl: 'https://tg.test' })
          : (answers.shift() ?? Response.json({ ok: true, result: {} })),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const sendMessage = (): Promise<unknown> => load(TELEGRAM_SEND_MESSAGE_NAME, 'telegramSendMessage')('cred', 7, 'hi');
  const sendButtons = (): Promise<unknown> =>
    load(TELEGRAM_SEND_BUTTONS_NAME, 'telegramSendButtons')('cred', 7, 'hi', []);
  const file = { id: 'f', name: 'a.png', size: 3, mime: 'image/png' };
  const sendFile = (): Promise<unknown> =>
    load(TELEGRAM_SEND_FILE_NAME, 'telegramSendFile')('cred', 7, file, 'auto', '');

  it('a delivered message is { success: true, disabled: false }', async () => {
    await expect(sendMessage()).resolves.toEqual({ success: true, disabled: false });
    await expect(sendButtons()).resolves.toEqual({ success: true, disabled: false });
    await expect(sendFile()).resolves.toEqual({ success: true, disabled: false });
  });

  it.each([
    'Forbidden: bot was blocked by the user',
    'Forbidden: user is deactivated',
    'Forbidden: bot was kicked from the supergroup chat',
    'Forbidden: bot is not a member of the channel chat',
    "Forbidden: bot can't initiate conversation with a user",
  ])('"%s" is { success: false, disabled: true } for every send action', async (description) => {
    answers.push(forbidden(description));
    await expect(sendMessage()).resolves.toEqual({ success: false, disabled: true });
    answers.push(forbidden(description));
    await expect(sendButtons()).resolves.toEqual({ success: false, disabled: true });
    answers.push(forbidden(description));
    await expect(sendFile()).resolves.toEqual({ success: false, disabled: true });
  });

  it('any other error still fails the activity — including the sandbox relay refusing a chat with 403', async () => {
    answers.push(forbidden('Forbidden: the chat is not connected to the test bot'));
    await expect(sendMessage()).rejects.toThrow(/not connected/);
    answers.push(Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 }));
    await expect(sendMessage()).rejects.toThrow(/chat not found/);
    answers.push(new Response('boom', { status: 500 }));
    await expect(sendButtons()).rejects.toThrow(/500/);
  });
});

// oxlint-disable no-new-func -- the generated activity code is compiled and run here, like max-community.test.ts does.
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VK_SEND_BUTTONS_NAME, VK_SEND_FILE_NAME, VK_SEND_MESSAGE_NAME } from './constants.js';
import { vkIntegration } from './vk.integration.js';

type TSend = (...args: unknown[]) => Promise<unknown>;

const action = (name: string): IActionDescriptor => {
  const found = vkIntegration.actions.find((item) => item.name === name);
  if (!found) throw new Error(`no action ${name}`);
  return found;
};

/**
 * Compiles the vendor's shared activity code plus one action's activity and returns the exported function. The
 * `@temporalio/activity` import is dropped too: `vkRandomId` falls back to a random id outside an activity.
 */
const load = (name: string, exportName: string): TSend => {
  const shared = (vkIntegration.sharedActivityCode ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  const source = [
    'const vkReadFileBytes = async () => new Uint8Array([1, 2, 3]);',
    shared,
    action(name).activityCode.replace(/^export /m, ''),
    `return ${exportName};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const env = { BACKEND_INTERNAL_URL: 'http://backend', INTERNAL_PROJECT_TOKEN: 't', PROJECT_ID: 'p' };
  return new Function('fetch', 'process', js)(globalThis.fetch, { env }) as TSend;
};

const vkError = (code: number): Response => Response.json({ error: { error_code: code, error_msg: `error ${code}` } });

describe('vk send actions report a disabled bot', () => {
  let answers: Response[] = [];
  beforeEach(() => {
    answers = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) =>
        String(url).includes('/internal/credentials/resolve')
          ? Response.json({ value: 'tok', apiBaseUrl: 'https://vk.test' })
          : (answers.shift() ?? Response.json({ response: 1 })),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const sendMessage = (): Promise<unknown> => load(VK_SEND_MESSAGE_NAME, 'vkSendMessage')('cred', 7, 'hi');
  const sendButtons = (): Promise<unknown> => load(VK_SEND_BUTTONS_NAME, 'vkSendButtons')('cred', 7, 'hi', []);
  const file = { id: 'f', name: 'a.png', size: 3, mime: 'image/png' };
  const sendFile = (): Promise<unknown> => load(VK_SEND_FILE_NAME, 'vkSendFile')('cred', 7, file, 'auto', '');

  it('a delivered message is { success: true, disabled: false }', async () => {
    await expect(sendMessage()).resolves.toEqual({ success: true, disabled: false });
    await expect(sendButtons()).resolves.toEqual({ success: true, disabled: false });
  });

  it.each([900, 901, 902, 917])('VK error %i is { success: false, disabled: true }', async (code) => {
    answers.push(vkError(code));
    await expect(sendMessage()).resolves.toEqual({ success: false, disabled: true });
    answers.push(vkError(code));
    await expect(sendButtons()).resolves.toEqual({ success: false, disabled: true });
    // The photo upload server call is the first to refuse a peer the community can't write to.
    answers.push(vkError(code));
    await expect(sendFile()).resolves.toEqual({ success: false, disabled: true });
  });

  it('any other VK or HTTP error still fails the activity', async () => {
    answers.push(vkError(5));
    await expect(sendMessage()).rejects.toThrow(/VK messages.send failed: 5 /);
    answers.push(new Response('boom', { status: 502 }));
    await expect(sendButtons()).rejects.toThrow(/502/);
  });
});

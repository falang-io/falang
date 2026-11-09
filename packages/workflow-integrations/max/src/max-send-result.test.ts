// oxlint-disable no-new-func -- the generated activity code is compiled and run here, like max-community.test.ts does.
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SEND_BUTTONS_NAME, MAX_SEND_FILE_NAME, MAX_SEND_MESSAGE_NAME } from './constants.js';
import { maxIntegration } from './max.integration.js';

type TSend = (...args: unknown[]) => Promise<unknown>;

const action = (name: string): IActionDescriptor => {
  const found = maxIntegration.actions.find((item) => item.name === name);
  if (!found) throw new Error(`no action ${name}`);
  return found;
};

/** Compiles the vendor's shared activity code plus one action's activity and returns the exported function. */
const load = (name: string, exportName: string): TSend => {
  const shared = (maxIntegration.sharedActivityCode ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  const source = [
    'const maxReadFileBytes = async () => new Uint8Array([1, 2, 3]);',
    shared,
    action(name).activityCode.replace(/^export /m, ''),
    `return ${exportName};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const env = { BACKEND_INTERNAL_URL: 'http://backend', INTERNAL_PROJECT_TOKEN: 't', PROJECT_ID: 'p' };
  return new Function('fetch', 'process', js)(globalThis.fetch, { env }) as TSend;
};

describe('max send actions report a disabled bot', () => {
  let answers: Response[] = [];
  beforeEach(() => {
    answers = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const text = String(url);
        if (text.includes('/internal/credentials/resolve')) {
          return Response.json({ value: 'tok', apiBaseUrl: 'https://max.test' });
        }
        if (text.includes('/uploads')) return Response.json({ url: 'https://upload.test/x', token: 'up' });
        if (text.startsWith('https://upload.test')) return Response.json({ token: 'file-token', photos: {} });
        return answers.shift() ?? Response.json({ message: { body: { mid: 'mid.1' } } });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const sendMessage = (): Promise<unknown> => load(MAX_SEND_MESSAGE_NAME, 'maxSendMessage')('cred', 7, 'hi', 'user');
  const sendButtons = (): Promise<unknown> =>
    load(MAX_SEND_BUTTONS_NAME, 'maxSendButtons')('cred', 7, 'hi', [], 'user');
  const file = { id: 'f', name: 'a.png', size: 3, mime: 'image/png' };
  const sendFile = (): Promise<unknown> => load(MAX_SEND_FILE_NAME, 'maxSendFile')('cred', 7, file, 'auto', '', 'user');

  it('a delivered message is { success: true, disabled: false }', async () => {
    await expect(sendMessage()).resolves.toEqual({ success: true, disabled: false });
    await expect(sendButtons()).resolves.toEqual({ success: true, disabled: false });
    await expect(sendFile()).resolves.toEqual({ success: true, disabled: false });
  });

  it('an error whose text says "suspended" is { success: false, disabled: true } for every send action', async () => {
    answers.push(Response.json({ code: 'chat.denied', message: 'error.dialog.suspended' }, { status: 403 }));
    await expect(sendMessage()).resolves.toEqual({ success: false, disabled: true });
    answers.push(Response.json({ success: false, message: 'Dialog is suspended' }));
    await expect(sendButtons()).resolves.toEqual({ success: false, disabled: true });
    answers.push(Response.json({ code: 'bad.request', message: 'dialog.suspended' }, { status: 400 }));
    await expect(sendFile()).resolves.toEqual({ success: false, disabled: true });
  });

  it('only the text decides: other errors, a 403 included, still fail the activity', async () => {
    answers.push(Response.json({ code: 'chat.denied', message: 'chat.denied' }, { status: 403 }));
    await expect(sendMessage()).rejects.toThrow(/403/);
    answers.push(Response.json({ code: 'not.found', message: 'Chat 7 not found' }, { status: 404 }));
    await expect(sendButtons()).rejects.toThrow(/not found/);
  });
});

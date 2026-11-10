// oxlint-disable no-new-func -- the generated activity code is compiled and run here, like telegram-send-result.test.ts does.
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALL_AI_IMAGE_NAME, CALL_AI_TEXT_NAME, CALL_AI_TRANSCRIBE_NAME } from './constants.js';
import { openaiIntegration } from './openai.integration.js';

type TActivity = (...args: unknown[]) => Promise<unknown>;

/** Stand-in for `@temporalio/activity`'s `ApplicationFailure` (the generated code imports the real one). */
class FakeApplicationFailure extends Error {
  readonly type: string;
  readonly nonRetryable = true;

  constructor(message: string, type: string) {
    super(message);
    this.type = type;
  }

  static nonRetryable(message: string, type: string): FakeApplicationFailure {
    return new FakeApplicationFailure(message, type);
  }
}

const activityCode = (name: string): string => {
  const found = openaiIntegration.actions.find((item) => item.name === name);
  if (!found) throw new Error(`no action ${name}`);
  return found.activityCode;
};

/** Compiles the vendor's shared activity code plus one activity and returns the exported function. */
const load = (code: string, exportName: string): TActivity => {
  const shared = (openaiIntegration.sharedActivityCode ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  const source = [
    'const fileToDataUrl = async () => "data:,";',
    'const openaiReadFileBytes = async () => new Uint8Array([1]);',
    'const openaiUploadFileFromStream = async () => ({ id: "f" });',
    shared,
    code.replace(/^export /m, ''),
    `return ${exportName};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const env = { BACKEND_INTERNAL_URL: 'http://backend', INTERNAL_PROJECT_TOKEN: 't', PROJECT_ID: 'p' };
  return new Function('fetch', 'process', 'ApplicationFailure', js)(
    globalThis.fetch,
    { env },
    FakeApplicationFailure,
  ) as TActivity;
};

const refusal = (): Response =>
  Response.json({ error: { code: 'not_supported_by_built_in_provider', message: 'Not yet' } }, { status: 400 });

describe('openai activities: built-in provider refusals are non-retryable (ADR 0081)', () => {
  let upstream: Response[] = [];
  let resolveAnswer: Response | null = null;
  beforeEach(() => {
    upstream = [];
    resolveAnswer = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) =>
        String(url).includes('/internal/credentials/resolve')
          ? (resolveAnswer ?? Response.json({ value: 'http://relay' }))
          : (upstream.shift() ?? Response.json({ choices: [{ message: { content: 'ok' } }] })),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const callAiText = (): Promise<unknown> => load(activityCode(CALL_AI_TEXT_NAME), 'callAiText')('cred', 'm', 'hi', []);

  it('402 fails non-retryably whatever the body', async () => {
    upstream.push(new Response('Payment Required', { status: 402 }));
    const error = await callAiText().catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(FakeApplicationFailure);
    expect(error).toMatchObject({ type: 'OPENAI_HTTP_402', message: 'OpenAI chat completion: Payment Required' });
  });

  it('a nested OpenAI-style error code and a top-level Nest-style code both count', async () => {
    upstream.push(
      Response.json({ error: { code: 'model_not_allowed', message: 'Model "x" is not offered' } }, { status: 400 }),
    );
    await expect(callAiText()).rejects.toMatchObject({
      type: 'model_not_allowed',
      message: 'OpenAI chat completion: Model "x" is not offered',
    });
    upstream.push(Response.json({ code: 'pricing_not_configured', message: 'No price' }, { status: 503 }));
    await expect(callAiText()).rejects.toMatchObject({ type: 'pricing_not_configured', nonRetryable: true });
  });

  it('a 429 and any other error stay plain (retryable) errors with the old message', async () => {
    upstream.push(Response.json({ code: 'insufficient_balance' }, { status: 429 }));
    const busy = await callAiText().catch((error_: unknown) => error_);
    expect(busy).not.toBeInstanceOf(FakeApplicationFailure);
    expect((busy as Error).message).toMatch(/^OpenAI chat completion failed: 429 /);
    upstream.push(new Response('boom', { status: 500 }));
    await expect(callAiText()).rejects.toThrow('OpenAI chat completion failed: 500 boom');
  });

  it('a 412 ai_provider_not_configured from the credential resolver is non-retryable', async () => {
    resolveAnswer = Response.json(
      { code: 'ai_provider_not_configured', message: 'The built-in AI provider is not configured' },
      { status: 412 },
    );
    await expect(callAiText()).rejects.toMatchObject({ type: 'ai_provider_not_configured', nonRetryable: true });
  });

  it('image and transcription refusals of the relay are non-retryable', async () => {
    upstream.push(refusal());
    await expect(load(activityCode(CALL_AI_IMAGE_NAME), 'callAiImage')('cred', 'm', 'p', 'auto')).rejects.toMatchObject(
      { type: 'not_supported_by_built_in_provider' },
    );
    upstream.push(refusal());
    const file = { id: 'f', name: 'a.ogg', size: 1, mime: 'audio/ogg' };
    await expect(
      load(activityCode(CALL_AI_TRANSCRIBE_NAME), 'callAiTranscribe')('cred', file, 'whisper-1', ''),
    ).rejects.toMatchObject({ type: 'not_supported_by_built_in_provider' });
  });
});

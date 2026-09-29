import express, { Router, type Request, type Response } from 'express';

interface IOpenAiChatMessage {
  readonly role: string;
  readonly content: string;
}

/** One scripted tool call — `arguments` is sent verbatim when a string (so a test can script invalid
 *  JSON, e.g. a completion cut off mid-object), JSON-encoded otherwise. */
export interface IOpenAiMockToolCall {
  readonly id?: string;
  readonly name: string;
  readonly arguments: unknown;
}

interface IQueuedResponse {
  readonly content: string | null;
  readonly toolCalls?: readonly IOpenAiMockToolCall[];
}

interface IOpenAiKeyState {
  readonly queuedResponses: IQueuedResponse[];
  readonly requests: unknown[];
}

/**
 * Partitioned by the raw `Authorization` header value (`Bearer <apiKey>`) rather than a URL segment
 * — OpenAI's real request shape carries the credential there, not in the path, so this is what
 * actually distinguishes concurrent e2e tests seeding different `apiKey` values. Admin routes below
 * accept the plain `apiKey` in the request body and derive the same `Bearer ${apiKey}` key, so
 * callers (see `client.ts`) never need to know this header-based partitioning scheme.
 */
const stateByAuthHeader = new Map<string, IOpenAiKeyState>();

/** Drops every key's state — used by the service-wide reset. */
export const resetAllOpenAiMockState = (): void => {
  stateByAuthHeader.clear();
};

const getState = (authHeader: string): IOpenAiKeyState => {
  let state = stateByAuthHeader.get(authHeader);
  if (!state) {
    state = { queuedResponses: [], requests: [] };
    stateByAuthHeader.set(authHeader, state);
  }
  return state;
};

const defaultContent = (messages: readonly IOpenAiChatMessage[]): string => {
  const lastUser = messages.toReversed().find((message) => message.role === 'user');
  return `mock-response-for: ${lastUser?.content ?? ''}`;
};

/** A minimal, valid 1x1 transparent PNG — stands in for a real generated image in `/images/generations`'s canned `b64_json`. */
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** `Content-Disposition: form-data; name="file"; filename="voice.mp3"` — pulls the attached file's name out of a raw multipart body without a multipart-parsing dependency (see `/audio/transcriptions` below). */
const MULTIPART_FILENAME = /filename="([^"]*)"/;

/**
 * Mocks the subset of the OpenAI-compatible chat completions API `call-ai-text`/`call-ai-choice`'s
 * activities call — and the in-app agent's tool-calling turns (`toolCalls`, ADR 0034 (private)) — plus
 * admin routes (prefixed `/__mock__`, not part of the real API) for e2e tests to script the next
 * response and inspect received requests.
 */
export const createOpenAiMockRouter = (): Router => {
  const router = Router();

  router.get('/openai/models', (_req: Request, res: Response) => {
    res.json({ data: [{ id: 'mock-model' }] });
  });

  router.post('/openai/chat/completions', (req: Request, res: Response) => {
    const state = getState(req.header('authorization') ?? '');
    state.requests.push(req.body);
    const queued = state.queuedResponses.shift() ?? { content: defaultContent(req.body.messages ?? []) };
    const toolCalls = queued.toolCalls?.map((call, index) => ({
      function: {
        arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments),
        name: call.name,
      },
      id: call.id ?? `call-${state.requests.length}-${index}`,
      type: 'function',
    }));
    const message = { content: queued.content, role: 'assistant', ...(toolCalls ? { tool_calls: toolCalls } : {}) };
    // A plausible `usage` object so the in-app agent's token accounting is exercised by e2e turns.
    res.json({ choices: [{ message }], usage: { completion_tokens: 7, prompt_tokens: 21, total_tokens: 28 } });
  });

  router.post('/openai/images/generations', (req: Request, res: Response) => {
    const state = getState(req.header('authorization') ?? '');
    // `kind` distinguishes this from a plain `/chat/completions` record without changing the shape
    // of an existing chat record (see `getOpenAiRequests`'s own doc comment) — chat records stay
    // exactly as before so `openai-mock.test.ts`'s pre-existing exact-shape assertion keeps passing.
    state.requests.push({ kind: 'image', ...req.body });
    res.json({ data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }] });
  });

  // No multer/multipart parser dependency: `express.json()` (mounted globally in `app.ts`) only
  // consumes a request whose content-type it recognizes, so a `multipart/form-data` body reaches
  // this route's own `express.raw({ type: () => true })` untouched — the raw bytes are enough to
  // pull `content-type`/size/filename out of `call-ai-transcribe`'s activity without decoding the
  // actual audio payload, which this mock never needs to look at.
  router.post(
    '/openai/audio/transcriptions',
    express.raw({ type: () => true, limit: '30mb' }),
    (req: Request, res: Response) => {
      const state = getState(req.header('authorization') ?? '');
      const bodyBuffer = req.body as Buffer;
      const filename = MULTIPART_FILENAME.exec(bodyBuffer.toString('latin1'))?.[1] ?? 'unknown';
      state.requests.push({
        contentType: req.header('content-type') ?? '',
        filename,
        kind: 'transcription',
        size: bodyBuffer.length,
      });
      res.json({ text: `transcribed: ${filename}` });
    },
  );

  router.post('/__mock__/openai/response', (req: Request, res: Response) => {
    const state = getState(`Bearer ${req.body.apiKey}`);
    state.queuedResponses.push({ content: req.body.content ?? null, toolCalls: req.body.toolCalls });
    res.json({ ok: true });
  });

  router.get('/__mock__/openai/requests', (req: Request, res: Response) => {
    const apiKey = req.query.apiKey;
    res.json({ requests: getState(`Bearer ${apiKey}`).requests });
  });

  router.post('/__mock__/openai/reset', (req: Request, res: Response) => {
    stateByAuthHeader.delete(`Bearer ${req.body.apiKey}`);
    res.json({ ok: true });
  });

  return router;
};

import express, { Router, type Request, type Response } from 'express';
import { parseMultipart } from './multipart.js';
import { registerModerationRoutes } from './telegram-mock-moderation.js';

/** One outbound call recorded for a given bot token — inspectable via the admin `/calls` route. */
export interface ITelegramMockCall {
  readonly method: string;
  readonly body: unknown;
}

/** A seeded fake file, keyed by `file_id` — see `/__mock__/telegram/:token/updates`'s `files` param below. */
interface ITelegramMockFile {
  readonly filePath: string;
  readonly mime: string;
  readonly bytes: Buffer;
}

interface ITelegramTokenState {
  readonly pendingUpdates: unknown[];
  readonly calls: ITelegramMockCall[];
  nextMessageId: number;
  nextUpdateId: number;
  /** See `IModerationState`. */
  readonly memberStatuses: Map<string, string>;
  readonly deletedMessages: Set<string>;
  /** The last `allowed_updates` recorded for `getUpdates` (`''` = none), so a one-second poll loop adds one entry per change, not per poll. */
  lastPolledAllowedUpdates: string;
  /** Keyed by `file_id` (for `getFile`) and by `file_path` (for the actual download route) — both point at the same seeded bytes. */
  readonly filesById: Map<string, ITelegramMockFile>;
  readonly filesByPath: Map<string, ITelegramMockFile>;
}

const stateByToken = new Map<string, ITelegramTokenState>();

/** Drops every token's state — used by the service-wide reset. */
export const resetAllTelegramMockState = (): void => {
  stateByToken.clear();
};

const getState = (token: string): ITelegramTokenState => {
  let state = stateByToken.get(token);
  if (!state) {
    state = {
      pendingUpdates: [],
      calls: [],
      nextMessageId: 1,
      nextUpdateId: 1,
      memberStatuses: new Map(),
      deletedMessages: new Set(),
      lastPolledAllowedUpdates: '',
      filesById: new Map(),
      filesByPath: new Map(),
    };
    stateByToken.set(token, state);
  }
  return state;
};

/** Express 5 types every route param as `string | string[]` (repeated-segment support); none of these routes ever repeat a param, so this just narrows back to the practical case. */
const paramString = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

/** Every real-API route is keyed by `:botSegment` (the literal `bot<token>` path segment Telegram's own URL shape uses, e.g. `${TELEGRAM_API_BASE_URL}/bot<token>/sendMessage`) rather than embedding `:token` directly after the literal `bot` text, which isn't a portable path-to-regexp pattern across versions. */
const tokenFromSegment = (botSegment: string | string[]): string => paramString(botSegment).replace(/^bot/, '');

const okResult = (res: Response, result: unknown): void => {
  res.json({ ok: true, result });
};

/** One seeded file passed to `/__mock__/telegram/:token/updates`'s `files` param — see `client.ts`'s `pushTelegramUpdate`. */
export interface ITelegramMockFileSeed {
  readonly file_id: string;
  readonly file_path: string;
  readonly mime: string;
  readonly base64: string;
}

const recordFileSend = (req: Request, res: Response, state: ITelegramTokenState, method: string): void => {
  const parsed = parseMultipart(req.body as Buffer, req.header('content-type') ?? '');
  state.calls.push({
    method,
    body: {
      chat_id: parsed.fields.chat_id,
      caption: parsed.fields.caption,
      field: parsed.file?.fieldName,
      filename: parsed.file?.filename,
      byteLength: parsed.file?.bytes.length ?? 0,
    },
  });
  const messageId = state.nextMessageId;
  state.nextMessageId += 1;
  okResult(res, { message_id: messageId });
};

/**
 * Mocks the subset of Telegram's Bot API this repo's activities (`telegram.integration.ts`) and
 * gateway ingress (`telegram-backend.ts`) actually call, plus admin routes (prefixed `/__mock__`,
 * not part of the real API) for e2e tests to queue inbound updates and inspect outbound calls.
 * State is partitioned per bot token, matching how real bots are independent of each other.
 */
export const createTelegramMockRouter = (): Router => {
  const router = Router();
  // Applied only to the multipart send-file routes below — `app.ts`'s global `express.json()` skips
  // a non-JSON content-type without touching the body stream, so this is free to read it raw.
  const rawBody = express.raw({ type: () => true, limit: '30mb' });

  router.post('/telegram/:botSegment/sendMessage', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    state.calls.push({ method: 'sendMessage', body: req.body });
    const messageId = state.nextMessageId;
    state.nextMessageId += 1;
    okResult(res, {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: req.body.chat_id, type: 'private' },
      text: req.body.text,
    });
  });

  // The platform "test bot" check (ADR 0073 (private)) identifies a token with getMe before saving it.
  router.all('/telegram/:botSegment/getMe', (req: Request, res: Response) => {
    const token = tokenFromSegment(req.params.botSegment);
    okResult(res, { id: 4242, is_bot: true, first_name: 'Mock Test Bot', username: 'mock_test_bot' });
    getState(token);
  });

  router.post('/telegram/:botSegment/editMessageReplyMarkup', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    state.calls.push({ method: 'editMessageReplyMarkup', body: req.body });
    okResult(res, true);
  });

  router.post('/telegram/:botSegment/answerCallbackQuery', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    state.calls.push({ method: 'answerCallbackQuery', body: req.body });
    okResult(res, true);
  });

  router.post('/telegram/:botSegment/setWebhook', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    state.calls.push({ method: 'setWebhook', body: req.body });
    okResult(res, true);
  });

  router.post('/telegram/:botSegment/deleteWebhook', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    state.calls.push({ method: 'deleteWebhook', body: req.body });
    okResult(res, true);
  });

  // Per-chat command menu of the platform test bot (ADR 0073 (private)); recorded like every other call.
  for (const method of ['setMyCommands', 'deleteMyCommands']) {
    router.post(`/telegram/:botSegment/${method}`, (req: Request, res: Response) => {
      const state = getState(tokenFromSegment(req.params.botSegment));
      state.calls.push({ method, body: req.body });
      okResult(res, true);
    });
  }

  // No real long-poll delay — `telegram-backend.ts`'s poll loop already re-invokes ~every second
  // regardless of what `timeout` it requested, so an immediate empty result is enough to drive it.
  router.get('/telegram/:botSegment/getUpdates', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    const updates = state.pendingUpdates.splice(0);
    // `allowed_updates` (a JSON array in the query) is what makes Telegram deliver `chat_member` at all — recorded when it changes.
    const allowedUpdates = typeof req.query.allowed_updates === 'string' ? req.query.allowed_updates : '';
    if (allowedUpdates !== state.lastPolledAllowedUpdates) {
      state.lastPolledAllowedUpdates = allowedUpdates;
      state.calls.push({
        method: 'getUpdates',
        body: allowedUpdates ? { allowed_updates: JSON.parse(allowedUpdates) as unknown } : {},
      });
    }
    okResult(res, updates);
  });

  registerModerationRoutes(router, (botSegment) => getState(tokenFromSegment(botSegment)));

  // `telegram-media.ts`'s `resolveIncomingMedia` calls this to resolve a `file_id` (from an update's
  // `photo`/`document`/… ref) into a `file_path` it then downloads — see ADR 0038 (private) §5.
  router.post('/telegram/:botSegment/getFile', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    const file = state.filesById.get(req.body.file_id as string);
    if (!file) {
      res.status(400).json({ ok: false, description: `file not found: ${req.body.file_id as string}` });
      return;
    }
    okResult(res, { file_id: req.body.file_id, file_path: file.filePath, file_size: file.bytes.length });
  });

  // The download half of `getFile`'s `file_path` — matches `resolveIncomingMedia`'s
  // `${apiBaseUrl}/file/bot<token>/<file_path>` (`apiBaseUrl` already includes this router's own
  // `/telegram` prefix in e2e config, so the full mock URL is `.../telegram/file/bot<token>/<path>`).
  router.get('/telegram/file/:botSegment/*path', (req: Request, res: Response) => {
    const state = getState(tokenFromSegment(req.params.botSegment));
    const rawPath = req.params.path as unknown as string | string[];
    const filePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
    const file = state.filesByPath.get(filePath);
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', file.mime);
    res.send(file.bytes);
  });

  router.post('/telegram/:botSegment/sendPhoto', rawBody, (req: Request, res: Response) => {
    recordFileSend(req, res, getState(tokenFromSegment(req.params.botSegment)), 'sendPhoto');
  });
  router.post('/telegram/:botSegment/sendDocument', rawBody, (req: Request, res: Response) => {
    recordFileSend(req, res, getState(tokenFromSegment(req.params.botSegment)), 'sendDocument');
  });
  router.post('/telegram/:botSegment/sendVideo', rawBody, (req: Request, res: Response) => {
    recordFileSend(req, res, getState(tokenFromSegment(req.params.botSegment)), 'sendVideo');
  });
  router.post('/telegram/:botSegment/sendAudio', rawBody, (req: Request, res: Response) => {
    recordFileSend(req, res, getState(tokenFromSegment(req.params.botSegment)), 'sendAudio');
  });
  router.post('/telegram/:botSegment/sendVoice', rawBody, (req: Request, res: Response) => {
    recordFileSend(req, res, getState(tokenFromSegment(req.params.botSegment)), 'sendVoice');
  });

  router.post('/__mock__/telegram/:token/updates', (req: Request, res: Response) => {
    const state = getState(paramString(req.params.token));
    const { files, ...update } = req.body as { files?: readonly ITelegramMockFileSeed[] };
    const updateId = state.nextUpdateId;
    state.nextUpdateId += 1;
    state.pendingUpdates.push({ update_id: updateId, ...update });
    for (const seed of files ?? []) {
      const file: ITelegramMockFile = {
        filePath: seed.file_path,
        mime: seed.mime,
        bytes: Buffer.from(seed.base64, 'base64'),
      };
      state.filesById.set(seed.file_id, file);
      state.filesByPath.set(seed.file_path, file);
    }
    res.json({ update_id: updateId });
  });

  router.get('/__mock__/telegram/:token/calls', (req: Request, res: Response) => {
    res.json({ calls: getState(paramString(req.params.token)).calls });
  });

  router.post('/__mock__/telegram/:token/reset', (req: Request, res: Response) => {
    stateByToken.delete(paramString(req.params.token));
    res.json({ ok: true });
  });

  return router;
};

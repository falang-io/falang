import { randomBytes } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { parseMultipart } from './multipart.js';

/** One outbound call recorded for a given bot token — inspectable via the admin `/calls` route. */
export interface IMaxMockCall {
  readonly method: string;
  readonly query: Record<string, string>;
  readonly body: unknown;
  /** `sendMessage` only: the `mid` the mock gave the sent message. */
  readonly mid?: string;
}

/** A seeded inbound file, downloadable at `<base>/files/<token>/<path>` — see `pushMaxUpdate`'s `files`. */
export interface IMaxMockFileSeed {
  readonly path: string;
  readonly mime: string;
  readonly base64: string;
}

interface IMaxMockFile {
  readonly mime: string;
  readonly bytes: Buffer;
}

interface IMaxTokenState {
  readonly pendingUpdates: unknown[];
  readonly calls: IMaxMockCall[];
  readonly messages: Map<string, { body: { mid: string; text: string | null } }>;
  readonly subscriptions: Map<string, unknown>;
  readonly files: Map<string, IMaxMockFile>;
  /** `chatId:userId` of members already removed via `DELETE /chats/:chatId/members`. */
  readonly removedMembers: Set<string>;
  /** `mid`s already deleted via `DELETE /messages`. */
  readonly deletedMessages: Set<string>;
  /** Makes every `mid` globally unique, like MAX's real ones — a rerun on a database that remembers old ones never collides. */
  readonly midPrefix: string;
  nextMessageId: number;
  nextMarker: number;
  nextUploadId: number;
}

const stateByToken = new Map<string, IMaxTokenState>();

export const resetAllMaxMockState = (): void => {
  stateByToken.clear();
};

const getState = (token: string): IMaxTokenState => {
  let state = stateByToken.get(token);
  if (!state) {
    state = {
      pendingUpdates: [],
      calls: [],
      messages: new Map(),
      subscriptions: new Map(),
      files: new Map(),
      removedMembers: new Set(),
      deletedMessages: new Set(),
      midPrefix: randomBytes(4).toString('hex'),
      nextMessageId: 1,
      nextMarker: 1,
      nextUploadId: 1,
    };
    stateByToken.set(token, state);
  }
  return state;
};

const paramString = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

const queryOf = (req: Request): Record<string, string> => {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') query[key] = value;
  return query;
};

/** Real Max puts the bot token in `Authorization`; an unauthenticated call gets Max's own 401 shape. */
const authorized = (req: Request, res: Response): IMaxTokenState | null => {
  const token = req.header('authorization');
  if (!token) {
    res.status(401).json({ code: 'verify.token', message: 'Empty access_token' });
    return null;
  }
  return getState(token);
};

/** This mock's own base URL as the caller sees it — `http://mocks:4100/max` for backend, the kind gateway address for runner pods. */
const baseUrlOf = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}/max`;

/** Placeholder a test puts into a queued update's attachment URLs; replaced with the poller's own view of this mock. */
export const MAX_MOCK_BASE_PLACEHOLDER = '__MAX_MOCK_BASE__';

/**
 * Mocks the subset of the Max Bot API (`https://dev.max.ru/docs-api`) that `@falang/workflow-integrations-max`'s
 * activities and gateway ingress call, plus admin routes (`/__mock__/max/...`) for e2e tests to queue updates and
 * inspect outbound calls. State is partitioned per bot token.
 */
export const createMaxMockRouter = (): Router => {
  const router = Router();
  const rawBody = express.raw({ type: () => true, limit: '30mb' });

  // The platform "test bot" check (ADR 0073 (private)) identifies a token with `GET /me` before saving it.
  router.get('/max/me', (req: Request, res: Response) => {
    if (!authorized(req, res)) return;
    res.json({ user_id: 4242, first_name: 'Mock Test Bot', username: 'mock_max_test_bot', is_bot: true });
  });

  router.post('/max/messages', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    const body = req.body as { text?: string | null };
    const mid = `mid.${state.midPrefix}.${state.nextMessageId}`;
    state.calls.push({ method: 'sendMessage', query: queryOf(req), body, mid });
    state.nextMessageId += 1;
    const message = {
      recipient: {
        chat_id: 'chat_id' in req.query ? Number(req.query.chat_id) : null,
        chat_type: 'dialog',
        user_id: 'user_id' in req.query ? Number(req.query.user_id) : null,
      },
      timestamp: Date.now(),
      body: { mid, seq: state.nextMessageId, text: body.text ?? null },
    };
    state.messages.set(mid, message);
    res.json({ message });
  });

  router.get('/max/messages/:mid', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({ method: 'getMessage', query: { message_id: paramString(req.params.mid) }, body: null });
    const message = state.messages.get(paramString(req.params.mid));
    if (!message) {
      res.status(404).json({ code: 'not.found', message: 'Message not found' });
      return;
    }
    res.json(message);
  });

  router.put('/max/messages', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({ method: 'editMessage', query: queryOf(req), body: req.body });
    res.json({ success: true });
  });

  // Moderation (ADR 0076 (private)): a repeated removal answers like real MAX — `200 { success: false, message }`.
  router.delete('/max/chats/:chatId/members', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({
      method: 'removeMember',
      query: { chat_id: paramString(req.params.chatId), ...queryOf(req) },
      body: null,
    });
    const key = `${paramString(req.params.chatId)}:${String(req.query.user_id)}`;
    if (state.removedMembers.has(key)) {
      res.json({ success: false, message: 'user is not a member' });
      return;
    }
    state.removedMembers.add(key);
    res.json({ success: true });
  });

  router.delete('/max/messages', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({ method: 'deleteMessage', query: queryOf(req), body: null });
    const mid = String(req.query.message_id);
    if (state.deletedMessages.has(mid)) {
      res.status(404).json({ code: 'not.found', message: 'Message not found' });
      return;
    }
    state.deletedMessages.add(mid);
    state.messages.delete(mid);
    res.json({ success: true });
  });

  router.post('/max/answers', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({ method: 'answerCallback', query: queryOf(req), body: req.body });
    res.json({ success: true });
  });

  router.get('/max/subscriptions', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    res.json({ subscriptions: [...state.subscriptions.values()] });
  });

  router.post('/max/subscriptions', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    const body = req.body as { url: string; update_types?: string[] };
    state.calls.push({ method: 'subscribe', query: queryOf(req), body });
    state.subscriptions.set(body.url, { url: body.url, time: Date.now(), update_types: body.update_types ?? null });
    res.json({ success: true });
  });

  router.delete('/max/subscriptions', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    state.calls.push({ method: 'unsubscribe', query: queryOf(req), body: null });
    state.subscriptions.delete(String(req.query.url));
    res.json({ success: true });
  });

  // No real long-poll delay — the gateway re-polls about every second anyway.
  router.get('/max/updates', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    const updates = state.pendingUpdates.splice(0);
    const marker = state.nextMarker;
    state.nextMarker += 1;
    const text = JSON.stringify(updates).replaceAll(MAX_MOCK_BASE_PLACEHOLDER, baseUrlOf(req));
    res.json({ updates: JSON.parse(text) as unknown[], marker });
  });

  router.get('/max/videos/:videoToken', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    const path = paramString(req.params.videoToken);
    if (!state.files.has(path)) {
      res.status(404).json({ code: 'not.found', message: 'Video not found' });
      return;
    }
    const token = encodeURIComponent(req.header('authorization') ?? '');
    res.json({ token: path, urls: { mp4_720: `${baseUrlOf(req)}/files/${token}/${path}` } });
  });

  // Seeded inbound media (`pushMaxUpdate`'s `files`): real Max serves attachment URLs without the bot token.
  router.get('/max/files/:token/:path', (req: Request, res: Response) => {
    const file = getState(paramString(req.params.token)).files.get(paramString(req.params.path));
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', file.mime);
    res.send(file.bytes);
  });

  // Step 1 of an outbound upload: an upload URL, plus the token right away for video/audio (as real Max does).
  router.post('/max/uploads', (req: Request, res: Response) => {
    const state = authorized(req, res);
    if (!state) return;
    const type = String(req.query.type);
    const uploadId = state.nextUploadId;
    state.nextUploadId += 1;
    const token = encodeURIComponent(req.header('authorization') ?? '');
    const url = `${baseUrlOf(req)}/upload/${token}/${type}/${uploadId}`;
    res.json(type === 'video' || type === 'audio' ? { url, token: `${type}-token-${uploadId}` } : { url });
  });

  // Step 2: the multipart `data` upload; image/file return what the message attachment needs.
  router.post('/max/upload/:token/:type/:uploadId', rawBody, (req: Request, res: Response) => {
    const state = getState(paramString(req.params.token));
    const type = paramString(req.params.type);
    const uploadId = paramString(req.params.uploadId);
    const parsed = parseMultipart(req.body as Buffer, req.header('content-type') ?? '');
    state.calls.push({
      method: 'upload',
      query: { type },
      body: {
        field: parsed.file?.fieldName,
        filename: parsed.file?.filename,
        byteLength: parsed.file?.bytes.length ?? 0,
      },
    });
    if (type === 'image') res.json({ photos: { [`p${uploadId}`]: { token: `image-token-${uploadId}` } } });
    else if (type === 'file') res.json({ id: Number(uploadId), token: `file-token-${uploadId}` });
    else res.json({ retval: 'ok' });
  });

  router.post('/__mock__/max/:token/updates', (req: Request, res: Response) => {
    const state = getState(paramString(req.params.token));
    const { files, ...update } = req.body as { files?: readonly IMaxMockFileSeed[] };
    for (const seed of files ?? []) {
      state.files.set(seed.path, { mime: seed.mime, bytes: Buffer.from(seed.base64, 'base64') });
    }
    state.pendingUpdates.push({ timestamp: Date.now(), ...update });
    res.json({ ok: true });
  });

  router.get('/__mock__/max/:token/calls', (req: Request, res: Response) => {
    res.json({ calls: getState(paramString(req.params.token)).calls });
  });

  router.post('/__mock__/max/:token/reset', (req: Request, res: Response) => {
    stateByToken.delete(paramString(req.params.token));
    res.json({ ok: true });
  });

  return router;
};

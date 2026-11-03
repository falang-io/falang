import express, { Router, type Request, type Response } from 'express';
import { parseMultipart } from './multipart.js';
import { runVkMethod } from './vk-methods.js';
import {
  VK_MOCK_BASE_PLACEHOLDER,
  VkApiError,
  baseUrlOf,
  collectParams,
  getState,
  paramString,
  stateByToken,
  tokenByPollKey,
  tokenByUploadId,
  tokenOf,
  withBase,
  type IVkMockFileSeed,
} from './vk-state.js';

export { VK_MOCK_BASE_PLACEHOLDER, resetAllVkMockState } from './vk-state.js';
export type { IVkMockCall, IVkMockFileSeed } from './vk-state.js';

const POLL_STEP_MS = 50;

/** Answers an `a_check` once there are updates or the (capped) wait is over. */
const answerLongPoll = (req: Request, res: Response, deadline: number): void => {
  const token = tokenByPollKey.get(paramString(req.params.pollKey));
  const state = token ? stateByToken.get(token) : null;
  if (!state || req.query.key !== state.longPollKey) {
    res.json({ failed: 2 });
    return;
  }
  if (state.pendingUpdates.length === 0 && Date.now() < deadline) {
    setTimeout(() => answerLongPoll(req, res, deadline), POLL_STEP_MS);
    return;
  }
  const updates = state.pendingUpdates.splice(0).map((update) => {
    const item = update as { type: string; object: unknown };
    const eventId = `mock${state.nextEventId}`;
    state.nextEventId += 1;
    return { type: item.type, event_id: eventId, v: '5.199', object: item.object, group_id: state.groupId };
  });
  if (updates.length > 0) state.ts += 1;
  res.json({ ts: String(state.ts), updates: withBase(updates, req) });
};

/**
 * Mocks the subset of the VK API (`https://dev.vk.com/ru/api`) that `@falang/workflow-integrations-vk` and the platform
 * test-bot adapter call: `/vk/method/<name>`, Bots Long Poll (`/vk/longpoll/<key>`), upload URLs (`/vk/upload/<id>`) and
 * seeded inbound files, plus admin routes (`/__mock__/vk/...`) for e2e tests to queue updates and inspect outbound calls.
 * State is partitioned per community token. Callback API delivery is not simulated — the callback server methods only store.
 */
export const createVkMockRouter = (): Router => {
  const router = Router();
  const rawBody = express.raw({ type: () => true, limit: '30mb' });

  router.all('/vk/method/:name', rawBody, (req: Request, res: Response) => {
    const name = paramString(req.params.name);
    const params = collectParams(req);
    const token = tokenOf(req, params);
    const requestParams = Object.entries(params).map(([key, value]) => ({ key, value }));
    if (!token) {
      res.json({
        error: {
          error_code: 5,
          error_msg: 'User authorization failed: no access_token passed.',
          request_params: requestParams,
        },
      });
      return;
    }
    const state = getState(token);
    const { access_token: _ignored, ...recordedParams } = params;
    try {
      const result = runVkMethod(name, { state, params, baseUrl: baseUrlOf(req), token });
      if (name !== 'groups.getLongPollServer')
        state.calls.push({ method: name, params: recordedParams, ...result.record });
      res.json({ response: result.response });
    } catch (error) {
      if (!(error instanceof VkApiError)) throw error;
      state.calls.push({ method: name, params: recordedParams });
      res.json({ error: { error_code: error.code, error_msg: error.message, request_params: requestParams } });
    }
  });

  // Bots Long Poll: answers pending updates at once, else waits a little (capped, the gateway re-polls anyway).
  router.get('/vk/longpoll/:pollKey', (req: Request, res: Response) => {
    const wait = Math.min(Number(req.query.wait) || 0, 2);
    answerLongPoll(req, res, Date.now() + wait * 1000);
  });

  // The upload URL carries its own identity (real VK signs it); the token is looked up from the upload id.
  router.post('/vk/upload/:uploadId', rawBody, (req: Request, res: Response) => {
    const uploadId = paramString(req.params.uploadId);
    const token = tokenByUploadId.get(uploadId);
    const slot = token ? getState(token).uploads.get(uploadId) : null;
    if (!token || !slot) {
      res.status(404).json({ error: 'unknown upload' });
      return;
    }
    const parsed = parseMultipart(req.body as Buffer, req.header('content-type') ?? '');
    getState(token).calls.push({
      method: 'upload',
      params: {},
      upload: {
        kind: slot.kind,
        field: parsed.file?.fieldName,
        filename: parsed.file?.filename,
        byteLength: parsed.file?.bytes.length ?? 0,
      },
    });
    if (slot.kind === 'photo') res.json({ server: 1, photo: `[{"mock":"${uploadId}"}]`, hash: `hash${uploadId}` });
    else res.json({ file: `mockfile${uploadId}` });
  });

  // Seeded inbound media (`pushVkUpdate`'s `files`): real VK serves attachment URLs without the token.
  router.get(/^\/vk\/files\/([^/]+)\/(.+)$/, (req: Request, res: Response) => {
    const [token, path] = Object.values(req.params as Record<string, string>).map((v) => decodeURIComponent(v));
    const file = stateByToken.get(token)?.files.get(path);
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', file.mime);
    res.send(file.bytes);
  });

  router.post('/__mock__/vk/:token/updates', (req: Request, res: Response) => {
    const state = getState(paramString(req.params.token));
    const body = req.body as { updates?: unknown[]; files?: readonly IVkMockFileSeed[] };
    for (const seed of body.files ?? []) {
      state.files.set(seed.path, { mime: seed.mime, bytes: Buffer.from(seed.base64, 'base64') });
    }
    state.pendingUpdates.push(...(body.updates ?? []));
    res.json({ ok: true });
  });

  router.get('/__mock__/vk/:token/calls', (req: Request, res: Response) => {
    res.json({ calls: getState(paramString(req.params.token)).calls });
  });

  router.post('/__mock__/vk/:token/reset', (req: Request, res: Response) => {
    stateByToken.delete(paramString(req.params.token));
    res.json({ ok: true });
  });

  return router;
};

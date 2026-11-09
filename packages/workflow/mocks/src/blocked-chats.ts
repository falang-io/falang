import { Router, type Request, type Response } from 'express';
import { VkApiError } from './vk-state.js';

/**
 * Chats whose user has blocked the bot, per messenger and bot token — a test marks them through
 * `POST /__mock__/<vendor>/:token/blocked-chats { chatIds }` (replaces the list), and the vendor mock's send routes then
 * answer with that messenger's own "bot blocked" error: Telegram 403 `Forbidden: bot was blocked by the user`, MAX an
 * error whose text says `suspended`, VK error 901.
 */
const blockedByKey = new Map<string, Set<string>>();

const keyOf = (vendor: string, token: string): string => `${vendor}:${token}`;

export const isChatBlocked = (vendor: string, token: string, chatId: unknown): boolean =>
  (chatId ?? null) !== null && (blockedByKey.get(keyOf(vendor, token))?.has(String(chatId)) ?? false);

/** Each messenger's own answer to a send into a chat that blocked the bot. */
const BLOCKED_REPLIES: Readonly<Record<string, { status: number; body: unknown }>> = {
  telegram: {
    status: 403,
    body: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
  },
  max: { status: 403, body: { code: 'chat.denied', message: 'error.dialog.suspended' } },
};

/** Answers `res` with the messenger's "bot blocked" error when `chatId` is blocked; `true` when it did. */
export const answeredBlocked = (res: Response, vendor: string, token: string, chatId: unknown): boolean => {
  const reply = BLOCKED_REPLIES[vendor];
  if (!reply || !isChatBlocked(vendor, token, chatId)) return false;
  res.status(reply.status).json(reply.body);
  return true;
};

/** VK answers HTTP 200 with an error object: the mock's method handlers throw this for a blocked peer. */
export const assertVkPeerNotBlocked = (token: string, peerId: unknown): void => {
  if (isChatBlocked('vk', token, peerId)) throw new VkApiError(901, "Can't send messages for users without permission");
};

/** Forgets every blocked chat — the service-wide reset (tests use a fresh bot token each, so there is no per-token one). */
export const resetAllBlockedChats = (): void => {
  blockedByKey.clear();
};

export const createBlockedChatsRouter = (): Router => {
  const router = Router();
  router.post('/__mock__/:vendor/:token/blocked-chats', (req: Request, res: Response) => {
    const { vendor, token } = req.params as { vendor: string; token: string };
    const chatIds = (req.body as { chatIds?: readonly (string | number)[] }).chatIds ?? [];
    blockedByKey.set(keyOf(vendor, token), new Set(chatIds.map(String)));
    res.json({ ok: true });
  });
  return router;
};

import type { Request, Response, Router } from 'express';

/** The slice of a bot token's mock state the group-moderation methods read and write. */
export interface IModerationState {
  readonly calls: { readonly method: string; readonly body: unknown }[];
  /** `chat_id:user_id` -> `ChatMember.status` once a moderation call changed it (default `member`). */
  readonly memberStatuses: Map<string, string>;
  /** `chat_id:message_id` of messages removed through `deleteMessage`. */
  readonly deletedMessages: Set<string>;
}

const okResult = (res: Response, result: unknown): void => {
  res.json({ ok: true, result });
};

const MOCK_USER = (id: number): { id: number; is_bot: boolean; first_name: string } => ({
  id,
  is_bot: false,
  first_name: `User ${id}`,
});

const memberKey = (body: { chat_id: unknown; user_id: unknown }): string =>
  `${String(body.chat_id)}:${String(body.user_id)}`;

const badRequest = (res: Response, description: string): void => {
  res.status(400).json({ ok: false, error_code: 400, description });
};

/** Group moderation methods (ADR 0076 (private)): ban/unban/delete/approve/decline/getChatMember, state per bot token. */
export const registerModerationRoutes = (
  router: Router,
  getState: (botSegment: string | string[]) => IModerationState,
): void => {
  const record = (req: Request, method: string): IModerationState => {
    const state = getState(req.params.botSegment);
    state.calls.push({ method, body: req.body });
    return state;
  };

  router.post('/telegram/:botSegment/banChatMember', (req: Request, res: Response) => {
    const state = record(req, 'banChatMember');
    state.memberStatuses.set(memberKey(req.body), 'kicked');
    okResult(res, true);
  });

  router.post('/telegram/:botSegment/unbanChatMember', (req: Request, res: Response) => {
    const state = record(req, 'unbanChatMember');
    const key = memberKey(req.body);
    // Like the real API: only_if_banned leaves a current member alone; otherwise the user ends up outside the chat.
    if (!req.body.only_if_banned || state.memberStatuses.get(key) === 'kicked') state.memberStatuses.set(key, 'left');
    okResult(res, true);
  });

  router.post('/telegram/:botSegment/deleteMessage', (req: Request, res: Response) => {
    const state = record(req, 'deleteMessage');
    const key = `${String(req.body.chat_id)}:${String(req.body.message_id)}`;
    if (state.deletedMessages.has(key)) {
      badRequest(res, 'Bad Request: message to delete not found');
      return;
    }
    state.deletedMessages.add(key);
    okResult(res, true);
  });

  for (const method of ['approveChatJoinRequest', 'declineChatJoinRequest']) {
    router.post(`/telegram/:botSegment/${method}`, (req: Request, res: Response) => {
      const state = record(req, method);
      const key = memberKey(req.body);
      if (method === 'approveChatJoinRequest') state.memberStatuses.set(key, 'member');
      okResult(res, true);
    });
  }

  router.post('/telegram/:botSegment/getChatMember', (req: Request, res: Response) => {
    const state = record(req, 'getChatMember');
    const status = state.memberStatuses.get(memberKey(req.body)) ?? 'member';
    okResult(res, { status, user: MOCK_USER(Number(req.body.user_id)) });
  });
};

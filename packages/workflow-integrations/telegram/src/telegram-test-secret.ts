/** Test helper: the webhook secret `ctx.deriveSecret` returns in these suites, and a way to make a request look like Telegram sent it. */
export const TEST_WEBHOOK_SECRET = 'test-webhook-secret-0123456789abcdefghijklmnop';

export const withTelegramSecret = (request: Request): Request => {
  const headers = new Headers(request.headers);
  headers.set('x-telegram-bot-api-secret-token', TEST_WEBHOOK_SECRET);
  return new Request(request, { headers });
};

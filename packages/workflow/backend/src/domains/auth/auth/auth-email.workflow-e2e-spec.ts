import { describe, expect, it } from 'vitest';
import { workflowE2eApi, workflowE2eWaitForValue } from '../../../test-utils/workflow-e2e-client.js';

/** Mailpit's HTTP API — the e2e stack's `mailpit` service (`docker-compose.workflow-e2e.yml`, host port 8026). */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8026';

interface IMailpitSearch {
  readonly messages?: readonly { readonly ID: string }[];
}

interface IMailpitMessage {
  readonly Text: string;
}

const mailTexts = async (address: string): Promise<string[]> => {
  const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  const found = (await search.json()) as IMailpitSearch;
  return Promise.all(
    (found.messages ?? []).map(async ({ ID }) => {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`);
      return ((await message.json()) as IMailpitMessage).Text;
    }),
  );
};

/** Waits for a mail to `address` carrying a `?<param>=<token>` link and returns the token. */
const waitForToken = (
  address: string,
  param: 'verifyEmail' | 'resetPassword',
  ignore: string[] = [],
): Promise<string> =>
  workflowE2eWaitForValue(async () => {
    for (const text of await mailTexts(address)) {
      const match = new RegExp(`[?&]${param}=([A-Za-z0-9_.~%-]+)`).exec(text);
      const token = match?.[1] ? decodeURIComponent(match[1]) : '';
      if (token && !ignore.includes(token)) return token;
    }
    return '';
  }, 30_000);

/**
 * Workflow-tier spec for the e-mail flows (open signup mode — what the e2e stack runs): register with
 * an address, confirm it from the mailed link, then reset the password from a second mailed link.
 * The closed-beta `application` mode needs a different `SIGNUP_MODE` and is not covered here.
 */
describe('auth e-mail flows (workflow tier, open mode)', () => {
  it('registers with an e-mail, verifies it, resets the password and signs in with the new one', async () => {
    const suffix = Date.now().toString(36);
    const username = `mailuser${suffix}`;
    const email = `${username}@example.test`;
    const password = 'first-password-1';

    const registered = await workflowE2eApi().post('/auth/register').send({ username, password, email });
    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({ email, emailVerified: false });

    const verifyToken = await waitForToken(email, 'verifyEmail');
    const verified = await workflowE2eApi().post('/auth/verify-email').send({ token: verifyToken });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ status: 'active' });
    const me = await workflowE2eApi()
      .get('/auth/me')
      .set({ Authorization: `Bearer ${registered.body.accessToken as string}` });
    expect(me.body).toMatchObject({ emailVerified: true });

    const forgot = await workflowE2eApi().post('/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(202);
    const resetToken = await waitForToken(email, 'resetPassword');
    const newPassword = 'second-password-2';
    const reset = await workflowE2eApi()
      .post('/auth/reset-password')
      .send({ token: resetToken, password: newPassword });
    expect(reset.status).toBe(204);

    const oldLogin = await workflowE2eApi().post('/auth/login').send({ username, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await workflowE2eApi().post('/auth/login').send({ username, password: newPassword });
    expect(newLogin.status).toBe(200);
  });
});

import ts from 'typescript';
import { amocrmIntegration } from '../amocrm.integration.js';

export interface IRecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export type TAmoCrmResponder = (request: IRecordedRequest) => { status: number; body?: unknown };

/** Stand-in for `@temporalio/activity`'s `ApplicationFailure` — only what the activity code uses. */
export class FakeApplicationFailure extends Error {
  readonly type: string | null;
  readonly nonRetryable: boolean;

  constructor(message: string, type: string | null, nonRetryable: boolean) {
    super(message);
    this.type = type;
    this.nonRetryable = nonRetryable;
  }

  static nonRetryable(message: string, type?: string): FakeApplicationFailure {
    return new FakeApplicationFailure(message, type ?? null, true);
  }
}

const BACKEND_URL = 'http://backend.internal';
export const ACCOUNT_DOMAIN = 'acme.amocrm.ru';
export const ACCESS_TOKEN = 'access-token-1';

/**
 * Loads every amoCRM activity exactly as `compileActivities` would concatenate them (shared code +
 * each action's `activityCode`), transpiled to CommonJS and run with a fake `fetch`: the backend's
 * credential-resolve endpoint answers with `ACCOUNT_DOMAIN`, every amoCRM call is recorded and answered
 * by `respond`. The OAuth2 token comes from a stubbed `resolveOAuth2AccessToken`.
 */
export const loadAmoCrmActivities = (
  respond: TAmoCrmResponder,
): { activities: Record<string, (...args: unknown[]) => Promise<unknown>>; requests: IRecordedRequest[] } => {
  const source = [
    amocrmIntegration.sharedActivityCode ?? '',
    ...amocrmIntegration.actions.map((a) => a.activityCode),
  ].join('\n');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const requests: IRecordedRequest[] = [];
  const fakeFetch = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => {
    if (url.startsWith(BACKEND_URL)) {
      return Promise.resolve(Response.json({ value: ACCOUNT_DOMAIN }));
    }
    const request: IRecordedRequest = {
      url,
      method: init.method,
      headers: init.headers ?? {},
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    };
    requests.push(request);
    const answer = respond(request);
    return Promise.resolve(
      'body' in answer
        ? Response.json(answer.body, { status: answer.status })
        : new Response(null, { status: answer.status }),
    );
  };
  const fakeRequire = (id: string): unknown => {
    if (id === '@temporalio/activity') return { ApplicationFailure: FakeApplicationFailure };
    if (id === '@falang/workflow-integrations-common') {
      return { resolveOAuth2AccessToken: () => Promise.resolve(ACCESS_TOKEN) };
    }
    throw new Error(`unexpected require: ${id}`);
  };
  const moduleExports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const env = { BACKEND_INTERNAL_URL: BACKEND_URL, INTERNAL_PROJECT_TOKEN: 'project-token', PROJECT_ID: 'project-1' };
  // oxlint-disable-next-line no-new-func -- evaluating the generated activity module is the point of this harness.
  new Function('exports', 'require', 'fetch', 'process', outputText)(moduleExports, fakeRequire, fakeFetch, { env });
  return { activities: moduleExports, requests };
};

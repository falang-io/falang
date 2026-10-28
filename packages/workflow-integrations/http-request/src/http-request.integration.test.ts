import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HTTP_REQUEST_ACTION_NAME, httpRequestIntegration } from './http-request.integration.js';

/** The `heartbeat` import of the activity code, stubbed. */
const noop = (): void => {
  // Nothing to report outside an activity.
};

describe('httpRequestIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([httpRequestIntegration]);
    expect(configs.map((config) => config.name)).toEqual([HTTP_REQUEST_ACTION_NAME]);
  });

  it('declares no credential fields — usable without configuring an integration instance first', () => {
    expect(httpRequestIntegration.credentialFields).toEqual([]);
    expect(httpRequestIntegration.triggers).toEqual([]);
  });

  it('http-request data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(httpRequestIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      method: 'POST',
      url: '`https://httpbin.org/post`',
      headers: "{ 'Content-Type': 'application/json' }",
      body: '{ hello: 1 }',
      responseAs: 'json',
      resultVariable: 'httpResult',
    });
    expect(parsed).toEqual({
      method: 'POST',
      url: '`https://httpbin.org/post`',
      headers: "{ 'Content-Type': 'application/json' }",
      body: '{ hello: 1 }',
      responseAs: 'json',
      onNetworkError: 'retry',
      resultVariable: 'httpResult',
    });
  });

  it('http-request opens in a sidebar, like other multi-field actions', () => {
    expect(httpRequestIntegration.actions[0].editorType).toBe('sidebar');
  });

  it('emit() assigns the call to resultVariable when one is set (responseAs unset defaults to auto)', () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'POST'",
      url: '`https://httpbin.org/post`',
      headers: "{ 'Content-Type': 'application/json' }",
      body: '{ hello: 1 }',
      responseAs: '',
      resultVariable: 'httpResult',
    });
    expect(emitted).toBe(
      "const httpResult = await httpRequest('POST', `https://httpbin.org/post`, { 'Content-Type': 'application/json' }, { hello: 1 }, 'auto', 'retry');",
    );
  });

  it('emit() omits the assignment when resultVariable is empty (never edited)', () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://httpbin.org/get`',
      headers: '',
      body: '',
      responseAs: '',
      resultVariable: '',
    });
    expect(emitted).toBe("await httpRequest('GET', `https://httpbin.org/get`, undefined, undefined, 'auto', 'retry');");
  });

  it('emit() defaults empty headers/body to undefined rather than an empty string', () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://httpbin.org/get`',
      headers: '',
      body: '',
      responseAs: '',
      resultVariable: 'result',
    });
    expect(emitted).toBe(
      "const result = await httpRequest('GET', `https://httpbin.org/get`, undefined, undefined, 'auto', 'retry');",
    );
  });

  it("emit() defaults responseAs to 'auto' when the field is entirely absent (a document saved before this field existed)", () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://httpbin.org/get`',
      headers: '',
      body: '',
      resultVariable: '',
    });
    expect(emitted).toBe("await httpRequest('GET', `https://httpbin.org/get`, undefined, undefined, 'auto', 'retry');");
  });

  it("emit() defaults responseAs to 'auto' for the JSON.stringify('') representation `resolveFieldExpression` produces for an unset select field", () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://httpbin.org/get`',
      headers: '',
      body: '',
      responseAs: '""',
      resultVariable: '',
    });
    expect(emitted).toBe("await httpRequest('GET', `https://httpbin.org/get`, undefined, undefined, 'auto', 'retry');");
  });

  it('emit() passes through an explicit responseAs value (e.g. "file") verbatim', () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://httpbin.org/get`',
      headers: '',
      body: '',
      responseAs: "'file'",
      resultVariable: 'downloaded',
    });
    expect(emitted).toBe(
      "const downloaded = await httpRequest('GET', `https://httpbin.org/get`, undefined, undefined, 'file', 'retry');",
    );
  });

  it("declares a 10-minute, regular (task-queue-routed) activity — streaming a File doesn't fit a 10s local activity", () => {
    expect(httpRequestIntegration.actions[0].activityOptions).toEqual({
      kind: 'regular',
      startToCloseTimeout: '10 minutes',
      heartbeatTimeout: '1 minute',
    });
  });

  it('activityCode is a self-contained TS module fragment with no credential resolution', () => {
    expect(httpRequestIntegration.actions[0].activityCode).toContain('export const httpRequest');
    expect(httpRequestIntegration.actions[0].activityCode).toContain('await fetch(url,');
    expect(httpRequestIntegration.actions[0].activityCode).not.toContain('resolveFieldValue');
    expect(httpRequestIntegration.actions[0].activityCode).not.toContain('credentialId');
  });

  it('activityCode parses JSON responses and falls back to text otherwise for responseAs "auto"', () => {
    expect(httpRequestIntegration.actions[0].activityCode).toContain("contentType.includes('application/json')");
  });

  it("activityCode streams the response into a File when responseAs is 'file'", () => {
    expect(httpRequestIntegration.actions[0].activityCode).toContain("responseAs === 'file'");
    expect(httpRequestIntegration.actions[0].activityCode).toContain('FalangFiles.uploadFileFromStream');
  });

  it('activityCode streams a File-shaped body as the request body via openFileStream', () => {
    expect(httpRequestIntegration.actions[0].activityCode).toContain('FalangFiles.openFileStream');
    expect(httpRequestIntegration.actions[0].activityCode).toContain("duplex = 'half'");
  });

  it("sharedActivityCode imports the files helpers as a namespace, never colliding with the files vendor's own named imports", () => {
    expect(httpRequestIntegration.sharedActivityCode).toContain(
      "import * as FalangFiles from '@falang/workflow-integrations-files';",
    );
    expect(httpRequestIntegration.sharedActivityCode).toContain("import { heartbeat } from '@temporalio/activity';");
  });
  it("emit() passes onNetworkError through, defaulting to 'retry'", () => {
    const emitted = httpRequestIntegration.actions[0].emit({
      method: "'GET'",
      url: '`https://example.com`',
      headers: '',
      body: '',
      responseAs: "'text'",
      onNetworkError: "'status'",
      resultVariable: 'check',
    });
    expect(emitted).toBe(
      "const check = await httpRequest('GET', `https://example.com`, undefined, undefined, 'text', 'status');",
    );
  });

  /** Runs the real activity code (transpiled, with stub imports) against `fetch`. */
  const loadActivity = (): ((...args: unknown[]) => Promise<{ status: number; body: unknown }>) => {
    const js = ts.transpileModule(httpRequestIntegration.actions[0].activityCode, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: Record<string, unknown> = {};
    // oxlint-disable-next-line no-new-func -- evaluates generated code under test.
    new Function('exports', 'heartbeat', 'FalangFiles', js)(exports, noop, {});
    return exports.httpRequest as (...args: unknown[]) => Promise<{ status: number; body: unknown }>;
  };

  it("a request that gets no response returns status 0 in 'status' mode and throws in 'retry' mode", async () => {
    const httpRequest = loadActivity();
    // Port 9 on localhost (discard) refuses the connection on any normal machine.
    const unreachable = 'http://127.0.0.1:9/';
    // Compiled code passes `undefined` for empty headers/body (a `null` body would be sent).
    // oxlint-disable-next-line no-undefined
    const result = await httpRequest('GET', unreachable, undefined, undefined, 'text', 'status');
    expect(result.status).toBe(0);
    expect(String(result.body)).toMatch(/fetch failed/i);
    // oxlint-disable-next-line no-undefined
    await expect(httpRequest('GET', unreachable, undefined, undefined, 'text')).rejects.toThrow();
  });
});

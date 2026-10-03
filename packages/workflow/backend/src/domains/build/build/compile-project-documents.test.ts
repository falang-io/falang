import { BadRequestException } from '@nestjs/common';
import type { INode, IProjectDocument } from '@falang/dto';
import { collectIntegrationActivityCode, compileActivities } from '@falang/workflow-compiler';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';
import { typeCheckProject } from './type-check-project.js';

// The `sqlite` vendor is off unless ENABLE_SQLITE_INTEGRATION=true (security audit P0-11); `vi.hoisted` runs before the imports below.
vi.hoisted(() => {
  process.env.ENABLE_SQLITE_INTEGRATION = 'true';
});

// `compileProjectDocuments` type-checks via a real TS program — cold-start cost can exceed
// vitest's default 5s test timeout when this file runs alongside the rest of the monorepo's suite
// (confirmed flaky at the default timeout; reliably under it at 20s) — see type-check-project.test.ts.
vi.setConfig({ testTimeout: 20_000 });

const functionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

describe('compileProjectDocuments', () => {
  it('returns the compiled project when every document compiles and type-checks', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };

    const result = compileProjectDocuments([document], []);
    expect(result.workflows).toContain('export async function run(): Promise<void> {');
    // Position tracking is on by default for a real artifact — and its runtime type-checks under
    // the same strict `ts.Program` as the user's own code (ADR 0022 (private)).
    expect(result.workflows).toContain('__falangEnter("doc-1");');
    expect(result.workflows).toContain('__falangAt("l1");');
  });

  it('type-checks a debug build with a trigger-function and a function returning returnValue', () => {
    const trigger: IProjectDocument = {
      id: 'doc-trigger',
      type: 'trigger-function',
      name: 'onMessage',
      root: {
        id: 'tf',
        name: 'trigger-function',
        children: [
          { id: 'tf-h', name: 'function-header', data: '' },
          {
            id: 'tf-b',
            name: 'trigger-function-body',
            data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' },
            children: [
              { id: 'c1', name: 'comment', data: 'Greets back' },
              { id: 'l1', name: 'log', data: 'got ${message.text}' },
            ],
          },
          { id: 'tf-f', name: 'function-footer', data: '' },
        ],
      },
    };
    const withReturn: IProjectDocument = {
      id: 'doc-fn',
      type: 'function',
      name: 'isPositive',
      root: {
        id: 'fn',
        name: 'function',
        children: [
          { id: 'fn-h', name: 'function-header', data: '' },
          {
            id: 'fn-b',
            name: 'function-body',
            data: { parameters: [{ name: 'count', type: { type: 'number' } }], returnValue: { type: 'boolean' } },
            children: [
              { id: 'a1', name: 'action', data: 'returnValue = count > 0' },
              { id: 'a2', name: 'action', data: 'count = count + 1', out: { id: 'r1', name: 'return', data: 'returnValue' } },
            ],
          },
          { id: 'fn-f', name: 'function-footer', data: '' },
        ],
      },
    };

    const result = compileProjectDocuments([trigger, withReturn], REGISTERED_INTEGRATIONS, { debug: true });
    expect(result.workflows).toContain('__falangDebug.trace');
    expect(result.workflows).toContain('let returnValue!: boolean;');
  });

  it('leaves the preview (trackPosition: false) free of the position-tracking runtime', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };

    const result = compileProjectDocuments([document], [], { trackPosition: false });
    expect(result.workflows).not.toContain('__falang');
  });

  it('rejects with a 400 carrying both the per-document errors and the partial generated files', () => {
    const broken: IProjectDocument = {
      id: 'doc-broken',
      type: 'function',
      name: 'broken',
      root: functionNode('doc-broken', [
        { id: 'c1', name: 'call-function', data: { schemeId: 'missing', parameters: [], returnVariable: '' } },
      ]),
    };
    const good: IProjectDocument = {
      id: 'doc-good',
      type: 'function',
      name: 'good',
      root: functionNode('doc-good', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };

    let thrown: unknown = null;
    try {
      compileProjectDocuments([broken, good], []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse() as {
      errors: { documentId: string; documentName: string; nodeId?: string; message: string }[];
      files: { path: string; content: string }[];
    };
    // `nodeId: 'c1'` — the compiler attributes this to the call-function node itself.
    expect(response.errors).toEqual([
      { documentId: 'doc-broken', documentName: 'broken', nodeId: 'c1', message: expect.stringMatching(/missing/) },
    ]);
    const workflowsFile = response.files.find((file) => file.path === 'workflows.ts');
    expect(workflowsFile?.content).toContain('export async function good(): Promise<void> {');
  });

  it('rejects with a 400 carrying a TypeScript type error attributed to its document and node', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      // `variableType` deliberately mistyped so the generated code assigns a string literal to a
      // `number`-typed const — a real TS error `compileProject` itself can't catch.
      root: functionNode('doc-1', [
        { id: 'v1', name: 'create-var', data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } } },
        { id: 'a1', name: 'action', data: 'total = "not a number"' },
      ]),
    };

    let thrown: unknown = null;
    try {
      compileProjectDocuments([document], []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse() as {
      errors: { documentId: string; documentName: string; nodeId?: string; message: string }[];
      files: { path: string; content: string }[];
    };
    expect(response.errors).toHaveLength(1);
    // `nodeId: 'a1'` — resolved via `compileProject`'s own `doc-start`/`icon-start` markers (see
    // `type-check-project.ts`), not `compileProject`'s own structural errors.
    expect(response.errors[0]).toMatchObject({ documentId: 'doc-1', documentName: 'run', nodeId: 'a1' });
    expect(response.files.find((file) => file.path === 'workflows.ts')?.content).toContain(
      'export async function run(): Promise<void> {',
    );
  });

  it('type-checks the activity code of every REGISTERED_INTEGRATIONS vendor side by side', () => {
    // Regression test: amoCRM's and Diadoc's native OAuth2 `sharedActivityCode` (ADR 0017 (private))
    // both start with the identical `import { resolveOAuth2AccessToken } from
    // '@falang/workflow-integrations-common';` line, which used to throw `Duplicate identifier
    // 'resolveOAuth2AccessToken'` from `typeCheckProject` once concatenated (fixed in
    // `compile-activities.ts` by import hoisting); the postgres/mysql/sqlite dialects collided the
    // same way (ADR 0039 (private)). `compileProject` now only emits the vendors a project uses, so a
    // real build no longer puts every vendor into one module — this test does it explicitly, since
    // any project may still combine any subset of vendors.
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };
    const { workflows } = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);

    const activities = compileActivities(collectIntegrationActivityCode(REGISTERED_INTEGRATIONS));

    expect(typeCheckProject(workflows, activities)).toEqual([]);
  });

  it('leaves unused integrations out of the compiled activities', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);

    expect(result.activities).not.toContain('telegramSendMessage');
    expect(result.activities).not.toContain('runActivepiecesAction');
    expect(result.workflows).toContain('const { logActivity } = proxyLocalActivities<');
  });
});

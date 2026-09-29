import { BadRequestException } from '@nestjs/common';
import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

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

  it('compiles and type-checks with every REGISTERED_INTEGRATIONS registered at once, even with none used by any document', () => {
    // Regression test: amoCRM's and Diadoc's native OAuth2 `sharedActivityCode` (ADR 0017 (private))
    // both start with the identical `import { resolveOAuth2AccessToken } from
    // '@falang/workflow-integrations-common';` line — every registered integration's activity code
    // compiles unconditionally (see `compile-project.ts`'s `buildWorkflowPreamble`), so this used to
    // throw `Duplicate identifier 'resolveOAuth2AccessToken'` from `typeCheckProject` on *every*
    // build, regardless of whether the project used amoCRM/Diadoc at all — found live via
    // ADR 0025 (private)'s package F e2e pass, fixed in `compile-activities.ts` (import hoisting).
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [{ id: 'l1', name: 'log', data: 'hi' }]),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('export async function run(): Promise<void> {');
  });
});

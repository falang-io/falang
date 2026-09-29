import type { INode, IProjectDocument } from '@falang/dto';
import { compileProject } from '@falang/workflow-compiler';
import { describe, expect, it, vi } from 'vitest';
import { typeCheckProject } from './type-check-project.js';

// `typeCheckProject` spins up a real TS program — cold-start cost (loading `.d.ts` lib files
// etc.) can exceed vitest's default 5s test timeout when this file runs alongside the rest of the
// monorepo's suite (confirmed flaky at the default timeout; reliably under it at 20s).
vi.setConfig({ testTimeout: 20_000 });

const VALID_ACTIVITIES = "export const logActivity = async (message: string): Promise<string> => message;\n";

describe('typeCheckProject', () => {
  it('reports no errors for genuinely valid compiled workflows/activities modules', () => {
    const functionNode: INode = {
      id: 'doc-1',
      name: 'function',
      children: [
        { id: 'doc-1-header', name: 'function-header', data: '' },
        {
          id: 'doc-1-body',
          name: 'function-body',
          data: { parameters: [] },
          children: [{ id: 'l1', name: 'log', data: '"hi"' }],
        },
        { id: 'doc-1-footer', name: 'function-footer', data: '' },
      ],
    };
    const document: IProjectDocument = { id: 'doc-1', type: 'function', name: 'run', root: functionNode };

    const compiled = compileProject({ documents: [document] });
    const errors = typeCheckProject(compiled.workflows, compiled.activities);

    expect(errors).toEqual([]);
  });

  it('attributes a type error in the workflows module back to its originating document and node via markers', () => {
    const workflows = [
      "import { condition, defineSignal, proxyLocalActivities, setHandler } from '@temporalio/workflow';",
      '',
      "const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({",
      "  startToCloseTimeout: '10 seconds',",
      '});',
      '',
      '// doc-start:run:doc-1',
      'export async function run(): Promise<void> {',
      '  // icon-start:action:a1',
      '  const x: number = "not a number";',
      '  // icon-end:action:a1',
      '}',
      '// doc-end:run:doc-1',
    ].join('\n');

    const errors = typeCheckProject(workflows, VALID_ACTIVITIES);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ documentId: 'doc-1', documentName: 'run', nodeId: 'a1' });
    expect(errors[0].message).toMatch(/not assignable/);
  });

  it('attributes a type error inside activities.ts to the unattributed "(generated code)" bucket, not to any document', () => {
    const workflows = [
      "import { condition, defineSignal, proxyLocalActivities, setHandler } from '@temporalio/workflow';",
      '',
      "const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({",
      "  startToCloseTimeout: '10 seconds',",
      '});',
      '',
      '// doc-start:run:doc-1',
      'export async function run(): Promise<void> {}',
      '// doc-end:run:doc-1',
    ].join('\n');
    const brokenActivities = 'export const logActivity: (message: string) => Promise<string> = 42;\n';

    const errors = typeCheckProject(workflows, brokenActivities);

    expect(errors).toHaveLength(1);
    expect(errors[0].documentId).toBe('');
    expect(errors[0].documentName).toBe('(generated code)');
  });
});

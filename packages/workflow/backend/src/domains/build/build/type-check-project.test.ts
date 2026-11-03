import type { INode, IProjectDocument } from '@falang/dto';
import { compileProject } from '@falang/workflow-compiler';
import { describe, expect, it, vi } from 'vitest';
import { typeCheckProject } from './type-check-project.js';

// `typeCheckProject` spins up a real TS program — cold-start cost (loading `.d.ts` lib files
// etc.) can exceed vitest's default 5s test timeout when this file runs alongside the rest of the
// monorepo's suite (confirmed flaky at the default timeout; reliably under it at 20s) — and ~26s
// under coverage instrumentation (`npm run coverage:unit`), hence 60s.
vi.setConfig({ testTimeout: 60_000 });

const VALID_ACTIVITIES = "export const logActivity = async (message: string): Promise<string> => message;\n";

/** A function document declaring `bookingAt`, then a `wait` node with the given duration expression. */
const waitFunctionDocument = (id: string, wait: string): IProjectDocument => ({
  id,
  type: 'function',
  name: `run${id}`,
  root: {
    id,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'function-body',
        data: { parameters: [] },
        children: [
          { id: `${id}-v`, name: 'action', data: 'const bookingAt = Date.now() + 3 * 24 * 3600 * 1000' },
          { id: `${id}-w`, name: 'wait', data: wait },
        ],
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});


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

  it('type-checks a wait node: milliseconds and duration literals pass, a boolean fails', () => {
    const valid = compileProject({
      documents: [waitFunctionDocument('A', "'30 minutes'"), waitFunctionDocument('B', 'bookingAt - Date.now() - 24 * 3600 * 1000')],
    });
    expect(typeCheckProject(valid.workflows, valid.activities)).toEqual([]);

    const invalid = compileProject({ documents: [waitFunctionDocument('C', 'true')] });
    const errors = typeCheckProject(invalid.workflows, invalid.activities);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ documentId: 'C', nodeId: 'C-w' });
  });

  it('attributes a type error in the workflows module back to its originating document and node via markers', () => {
    const workflows = [
      "import { condition, defineSignal, proxyLocalActivities, setHandler } from '@temporalio/workflow';",
      '',
      "const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({",
      "  startToCloseTimeout: '10 seconds',",
      "  retry: { maximumAttempts: 5 },",
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
      "  retry: { maximumAttempts: 5 },",
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

describe('typeCheckProject — magic node (ADR 0046 (private))', () => {
  it('a variable created inside a magic node is visible after it (children compile inlined)', () => {
    const functionNode: INode = {
      id: 'doc-1',
      name: 'function',
      children: [
        { id: 'doc-1-header', name: 'function-header', data: '' },
        {
          id: 'doc-1-body',
          name: 'function-body',
          data: { parameters: [] },
          children: [
            {
              id: 'm1',
              name: 'magic',
              data: { spell: 'count' },
              children: [
                {
                  id: 'v1',
                  name: 'create-var',
                  data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } },
                },
              ],
            },
            { id: 'l1', name: 'log', data: '`${total}`' },
          ],
        },
        { id: 'doc-1-footer', name: 'function-footer', data: '' },
      ],
    };
    const document: IProjectDocument = { id: 'doc-1', type: 'function', name: 'run', root: functionNode };
    const compiled = compileProject({ documents: [document] });
    expect(typeCheckProject(compiled.workflows, compiled.activities)).toEqual([]);
  });
});

/** A function document whose body is the given `action` statements, in order. */
const actionsFunctionDocument = (actions: string[]): IProjectDocument => ({
  id: 'doc-d',
  type: 'function',
  name: 'runDates',
  root: {
    id: 'doc-d',
    name: 'function',
    children: [
      { id: 'doc-d-header', name: 'function-header', data: '' },
      {
        id: 'doc-d-body',
        name: 'function-body',
        data: { parameters: [] },
        children: actions.map((data, index) => ({ id: `doc-d-a${index}`, name: 'action', data })),
      },
      { id: 'doc-d-footer', name: 'function-footer', data: '' },
    ],
  },
});

describe('typeCheckProject — the dayjs global', () => {
  it('type-checks dayjs with its plugins without an import in user code', () => {
    const compiled = compileProject({
      documents: [
        actionsFunctionDocument([
          "const moscow: string = dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')",
          "const parsed = dayjs.utc('03.11.2026', 'DD.MM.YYYY')",
          "const later: boolean = parsed.add(dayjs.duration({ days: 1 })).isSameOrAfter(parsed)",
          "const ago: string = parsed.locale('ru').fromNow()",
        ]),
      ],
    });
    expect(typeCheckProject(compiled.workflows, compiled.activities)).toEqual([]);
  });

  it('still reports a wrong dayjs call against the node', () => {
    const compiled = compileProject({ documents: [actionsFunctionDocument(['const n: number = dayjs().format()'])] });
    const errors = typeCheckProject(compiled.workflows, compiled.activities);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ documentId: 'doc-d', nodeId: 'doc-d-a0' });
  });
});

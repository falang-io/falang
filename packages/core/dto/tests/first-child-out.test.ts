import { describe, expect, it } from 'vitest';
import * as zod from 'zod';
import { NodesGroup, NodesStack } from '../src';
import { action, cycle, functionCfg, ifCfg, parallelCfg, switchCfg } from '../src';

/** `parseNode` throws a `ZodError` whose `.issues` carry the raw (unescaped) custom message. */
const firstIssueMessage = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    const issues = (error as { issues?: readonly { message: string }[] }).issues;
    if (issues?.[0]) return issues[0].message;
    throw error;
  }
  throw new Error('expected fn to throw');
};

// The renderer draws every skewer's `children[0]` as continuing the enclosing scheme's main path
// straight down (`SkewerStore.isFirst` starts `true` and is only ever flipped to `false` for a
// non-first thread — `threads/update-threads-child-positions.ts`), so `hasOutError` fires on *any*
// out attached to a first-drawn chain, whatever the parent's children policy — a branching node's
// first branch (`if`/`switch`/`parallel`), a plain sequential body, or a cycle. `createZodUnion`
// mirrors that unconditionally: any node config that declares children at all forbids `out` on
// `children[0]`.
describe('first child must not have an out', () => {
  const stringType = { type: zod.string(), default: () => '' };
  const numberType = { type: zod.number(), default: () => 0 };

  const buildStack = () =>
    new NodesStack([
      new NodesGroup([
        action('action', stringType),
        action('out', numberType),
        cycle('while', stringType),
        ...ifCfg('if', stringType),
        ...switchCfg({ name: 'switch', data: stringType, optionData: stringType }),
        ...parallelCfg('parallel'),
        ...functionCfg({ name: 'function', data: stringType, footer: stringType, header: stringType }),
      ]),
    ]);

  const outNode = { id: 'out-1', name: 'out', data: 0 };

  describe('if', () => {
    const buildInvalidIf = () => ({
      id: '1',
      name: 'if',
      data: '',
      children: [
        { id: '2', name: 'if-child', children: [], out: outNode },
        { id: '3', name: 'if-child', children: [] },
      ],
    });

    it('rejects an out on children[0] (if-child)', () => {
      const stack = buildStack();
      expect(() => stack.parseNode(buildInvalidIf())).toThrow();
    });

    it('names the parent ("if") in the error message', () => {
      const stack = buildStack();
      expect(firstIssueMessage(() => stack.parseNode(buildInvalidIf()))).toContain('first child of "if"');
    });

    it('accepts an out on children[1] (if-child)', () => {
      const stack = buildStack();
      expect(() =>
        stack.parseNode({
          id: '1',
          name: 'if',
          data: '',
          children: [
            { id: '2', name: 'if-child', children: [] },
            { id: '3', name: 'if-child', children: [], out: outNode },
          ],
        }),
      ).not.toThrow();
    });

    it('rejects the same structure via parseDocument', () => {
      const stack = buildStack();
      expect(() =>
        stack.parseDocument({
          id: 'doc-1',
          name: 'doc',
          root: {
            id: 'root',
            name: 'function',
            children: [
              { id: 'h', name: 'function-header', data: '' },
              {
                id: 'b',
                name: 'function-body',
                data: '',
                children: [
                  {
                    id: '1',
                    name: 'if',
                    data: '',
                    children: [
                      { id: '2', name: 'if-child', children: [], out: outNode },
                      { id: '3', name: 'if-child', children: [] },
                    ],
                  },
                ],
              },
              { id: 'f', name: 'function-footer', data: '' },
            ],
          },
        }),
      ).toThrow();
    });
  });

  describe('switch', () => {
    const buildInvalidSwitch = () => ({
      id: '1',
      name: 'switch',
      data: '',
      children: [
        { id: '2', name: 'switch-option', data: '', children: [], out: outNode },
        { id: '3', name: 'switch-option', data: '', children: [] },
      ],
    });

    it('rejects an out on children[0] (switch-option)', () => {
      const stack = buildStack();
      expect(() => stack.parseNode(buildInvalidSwitch())).toThrow();
    });

    it('names the parent ("switch") in the error message', () => {
      const stack = buildStack();
      expect(firstIssueMessage(() => stack.parseNode(buildInvalidSwitch()))).toContain('first child of "switch"');
    });

    it('accepts an out on a later switch-option', () => {
      const stack = buildStack();
      expect(() =>
        stack.parseNode({
          id: '1',
          name: 'switch',
          data: '',
          children: [
            { id: '2', name: 'switch-option', data: '', children: [] },
            { id: '3', name: 'switch-option', data: '', children: [], out: outNode },
          ],
        }),
      ).not.toThrow();
    });
  });

  describe('parallel', () => {
    const buildInvalidParallel = () => ({
      id: '1',
      name: 'parallel',
      children: [
        { id: '2', name: 'parallel-thread', children: [], out: outNode },
        { id: '3', name: 'parallel-thread', children: [] },
      ],
    });

    it('rejects an out on children[0] (parallel-thread)', () => {
      const stack = buildStack();
      expect(() => stack.parseNode(buildInvalidParallel())).toThrow();
    });

    it('names the parent ("parallel") in the error message', () => {
      const stack = buildStack();
      expect(firstIssueMessage(() => stack.parseNode(buildInvalidParallel()))).toContain('first child of "parallel"');
    });

    it('accepts an out on a later parallel-thread', () => {
      const stack = buildStack();
      expect(() =>
        stack.parseNode({
          id: '1',
          name: 'parallel',
          children: [
            { id: '2', name: 'parallel-thread', children: [] },
            { id: '3', name: 'parallel-thread', children: [], out: outNode },
          ],
        }),
      ).not.toThrow();
    });
  });

  // Changed from the previous, narrower pass: the rule is now universal, not limited to branching
  // (`if`/`switch`/`parallel`) parents — a `children: true` container (e.g. `function-body`) is under
  // it too, matching the renderer's own `SkewerStore.isFirst`/`hasOutError` behavior, which doesn't
  // distinguish a branch from a plain sequential body.
  it('rejects a children: true container (function-body) with an out on its first child', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '1',
        name: 'function-body',
        data: '',
        children: [{ id: '2', name: 'while', data: '', children: [], out: outNode }],
      }),
    ).toThrow();
  });

  it('accepts an out on a later child of the same function-body', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '1',
        name: 'function-body',
        data: '',
        children: [
          { id: '2', name: 'action', data: '' },
          { id: '3', name: 'while', data: '', children: [], out: outNode },
        ],
      }),
    ).not.toThrow();
  });

  // Same universal rule applied to a cycle's own body: `while` is itself a `children: true` node, so
  // its own children[0] must not have an out either — no exception for cycles.
  it('rejects a cycle (while) with an out on its first child', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '1',
        name: 'while',
        data: '',
        children: [{ id: '2', name: 'action', data: '', out: outNode }],
      }),
    ).toThrow();
  });

  it('accepts an out on a later child of the same cycle (while)', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '1',
        name: 'while',
        data: '',
        children: [
          { id: '2', name: 'action', data: '' },
          { id: '3', name: 'action', data: '', out: outNode },
        ],
      }),
    ).not.toThrow();
  });
});

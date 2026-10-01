import { describe, expect, it } from 'vitest';
import { NodesStack, type INode, type IProjectDocument } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { convertBodyAndExit, convertStatement, fixFirstStatementOut, type IConvertContext } from './convert-common.js';
import type { IOldIcon, IOldOut } from './old-types.js';

/**
 * Unit-level coverage of `convert-common.ts`'s mitigation for `@falang/dto`'s "no `out`
 * (break/continue/return/throw) on `children[0]` of any children-bearing container" rule (see
 * `fixIfFirstBranchOut`/`rotateFirstParallelThreadIfOut`/`fixFirstStatementOut`'s own doc comments)
 * — independent of any particular domain's `IConvertContext` conventions (logic's
 * `returnValue`-merge, code/text's raw leaf text, ...), so this uses a minimal, self-contained
 * context rather than `createLogicContext`/the code or text domains' own.
 */
const stack = new NodesStack([functionNodesGroup]);

const ctx: IConvertContext = {
  conditionText: (block) => (typeof block?.expression === 'string' ? block.expression : ''),
  foreachData: () => ({ arr: 'arr', item: 'item', index: 'index' }),
  finalizeReturn: (children, out) => ({ children, data: out.block?.expression ?? '' }),
  convertLeaf: (old) => {
    if (old.alias === 'action') return { id: old.id, name: 'action', data: old.block?.expression ?? '' };
    throw new Error(`Unsupported old icon alias in test context: "${old.alias}"`);
  },
};

const oldOut = (type: 'return' | 'break' | 'continue' | 'throw', id: string, expression?: string): IOldOut => {
  const base: IOldOut = { id, alias: 'system', type, level: 1 };
  return expression ? { ...base, block: { expression } } : base;
};

/** A branch wrapper icon (`if`/`parallel`'s own children) — no statements of its own, optionally exiting early. */
const oldBranch = (id: string, out?: IOldOut): IOldIcon => {
  const base: IOldIcon = { id, alias: 'system', children: [] };
  return out ? { ...base, out } : base;
};

/** A `switch`'s own case wrapper icon — like `oldBranch`, but with the case-condition text `switch` reads. */
const oldSwitchOption = (id: string, caseExpression: string, out?: IOldOut): IOldIcon => {
  const base: IOldIcon = { id, alias: 'system', block: { expression: caseExpression }, children: [] };
  return out ? { ...base, out } : base;
};

const oldIf = (id: string, branches: [IOldIcon, IOldIcon]): IOldIcon => ({
  id,
  alias: 'if',
  block: { expression: 'cond' },
  children: branches,
});

const oldAction = (id: string, expression: string): IOldIcon => ({ id, alias: 'action', block: { expression } });

/** Wraps a bare `function-body` children list into a full, `parseDocument`-able document. */
const wrapInFunctionDocument = (statements: INode[]): IProjectDocument => ({
  id: 'doc1',
  type: 'function',
  name: 'Test',
  root: {
    id: 'root1',
    name: 'function',
    children: [
      { id: 'header1', name: 'function-header', data: '' },
      { id: 'body1', name: 'function-body', data: { parameters: [] }, children: statements },
      { id: 'footer1', name: 'function-footer', data: '' },
    ],
  },
});

describe('convertStatement — "if"/"switch"/"parallel" branch-slot-0 mitigation', () => {
  it('swaps an "if"\'s two branches (and inverts meta.trueOnRight) when only the first branch has an early exit', () => {
    const falseBranch = oldBranch('b0', oldOut('return', 'o0', 'false'));
    const trueBranch = oldBranch('b1');
    const [ifNode, ...rest] = convertStatement(oldIf('if1', [falseBranch, trueBranch]), ctx);

    expect(rest).toHaveLength(0);
    expect(ifNode.name).toBe('if');
    const [slot0, slot1] = ifNode.children as [INode, INode];
    // The branch that used to exit (`falseBranch`) is no longer in slot 0 (the DTO-forbidden spot) —
    // it moved to slot 1, and `trueOnRight` flipped from its default (unset ⇒ false) to `true` to
    // compensate, so `resolveIfBranches`'s own {thenChild, elseChild} resolution is unchanged: slot 1
    // under `trueOnRight: true` is still the "then" branch, exactly as slot 0 was under the default.
    expect(slot0.out).toBeUndefined();
    expect(slot1.out?.name).toBe('return');
    expect(slot1.out?.data).toBe('false');
    expect(ifNode.meta?.trueOnRight).toBe(true);

    expect(() => stack.parseNode(ifNode)).not.toThrow();
  });

  it('leaves an "if" alone when only the second branch has an early exit (already a valid slot)', () => {
    const falseBranch = oldBranch('b0');
    const trueBranch = oldBranch('b1', oldOut('return', 'o1', 'true'));
    const [ifNode, ...rest] = convertStatement(oldIf('if1', [falseBranch, trueBranch]), ctx);

    expect(rest).toHaveLength(0);
    const [slot0, slot1] = ifNode.children as [INode, INode];
    expect(slot0.out).toBeUndefined();
    expect(slot1.out?.name).toBe('return');
    expect(ifNode.meta).toBeUndefined();

    expect(() => stack.parseNode(ifNode)).not.toThrow();
  });

  it("hoists the first branch's early exit into the parent chain when both branches exit unconditionally", () => {
    const falseBranch = oldBranch('b0', oldOut('return', 'o0', 'false'));
    const trueBranch = oldBranch('b1', oldOut('return', 'o1', 'true'));
    const [ifNode, hoisted] = convertStatement(oldIf('if1', [falseBranch, trueBranch]), ctx);

    expect(hoisted).toBeDefined();
    expect(hoisted?.name).toBe('return');
    expect(hoisted?.data).toBe('false');

    const [slot0, slot1] = ifNode.children as [INode, INode];
    // Slot 1 (which was already valid) is completely untouched; only slot 0 lost its `out`.
    expect(slot0.out).toBeUndefined();
    expect(slot1.out?.name).toBe('return');
    expect(slot1.out?.data).toBe('true');

    expect(() => stack.parseNode(ifNode)).not.toThrow();
    expect(() => stack.parseNode(hoisted as INode)).not.toThrow();

    // End-to-end: the hoisted `return` really does land as an ordinary trailing statement right after
    // the `if` in the enclosing chain, and the whole document still validates — same representation
    // `finalizeFunctionBody` already uses for a function's own natural end-of-body return
    // (`convert-project.test.ts`'s "MonteCarlo" case).
    const statements = convertBodyAndExit(
      [oldIf('if1', [falseBranch, trueBranch])],
      null,
      ctx,
      'function-body',
    ).children;
    expect(statements).toHaveLength(2);
    expect(statements[0].name).toBe('if');
    expect(statements[1]).toEqual(hoisted);
    expect(() => stack.parseDocument(wrapInFunctionDocument(statements))).not.toThrow();
  });

  it('throws for a "switch" whose first case has an early exit (no generically safe reorder)', () => {
    const firstCase = oldSwitchOption('opt0', 'case1', oldOut('return', 'o0', '1'));
    const secondCase = oldSwitchOption('opt1', 'case2');
    const switchIcon: IOldIcon = {
      id: 'sw1',
      alias: 'switch',
      block: { expression: 'x' },
      children: [firstCase, secondCase],
    };

    expect(() => convertStatement(switchIcon, ctx)).toThrow(/first case ends with an early "return"/);
  });

  it('does not throw for a "switch" whose first case falls through normally', () => {
    const firstCase = oldSwitchOption('opt0', 'case1');
    const secondCase = oldSwitchOption('opt1', 'case2', oldOut('return', 'o1', '2'));
    const switchIcon: IOldIcon = {
      id: 'sw1',
      alias: 'switch',
      block: { expression: 'x' },
      children: [firstCase, secondCase],
    };

    const [switchNode] = convertStatement(switchIcon, ctx);
    expect(() => stack.parseNode(switchNode)).not.toThrow();
  });

  it('rotates a "parallel"\'s first thread to the end when only it has an early exit (threads are order-independent)', () => {
    const firstThread = oldBranch('t0', oldOut('break', 'o0'));
    const secondThread = oldBranch('t1');
    const parallelIcon: IOldIcon = { id: 'p1', alias: 'parallel', children: [firstThread, secondThread] };

    const [parallelNode] = convertStatement(parallelIcon, ctx);
    const children = parallelNode.children as INode[];
    expect(children.map((c) => c.id)).toEqual(['t1', 't0']);
    expect(children[1].out?.name).toBe('break');
    expect(() => stack.parseNode(parallelNode)).not.toThrow();
  });
});

describe('fixFirstStatementOut — the general "children[0] must not have out" mitigation (any container, not just if/switch/parallel)', () => {
  it('leaves a chain alone when its first statement has no early exit', () => {
    const whileIcon: IOldIcon = {
      id: 'w1',
      alias: 'while',
      block: { expression: 'x < 10' },
      children: [oldAction('a1', 'x = x + 1')],
    };
    const actionAfter = oldAction('a2', 'y = 1');

    const statements = convertBodyAndExit([whileIcon, actionAfter], null, ctx, 'function-body').children;
    expect(statements).toHaveLength(2);
    expect(statements[0].out).toBeUndefined();
    expect(() => stack.parseDocument(wrapInFunctionDocument(statements))).not.toThrow();
  });

  it(
    'drops a "continue" that would land on a loop first in its parent chain (a no-op: it\'s already the last ' +
      "statement of the loop body, so it changes nothing whether it's there or not)",
    () => {
      const whileIcon: IOldIcon = {
        id: 'w1',
        alias: 'while',
        block: { expression: 'x < 10' },
        children: [oldAction('a1', 'x = x + 1')],
        out: oldOut('continue', 'wout'),
      };
      const actionAfter = oldAction('a2', 'y = 1');

      const statements = convertBodyAndExit([whileIcon, actionAfter], null, ctx, 'function-body').children;
      expect(statements).toHaveLength(2);
      const [whileNode, actionNode] = statements;
      expect(whileNode.name).toBe('while');
      expect(whileNode.out).toBeUndefined();
      expect(actionNode.name).toBe('action');

      expect(() => stack.parseDocument(wrapInFunctionDocument(statements))).not.toThrow();
    },
  );

  it(
    'throws for a "while"/"foreach" first in its parent chain with a "break"/"return"/"throw" own-exit ' +
      '(the loop may run zero times, so neither dropping nor hoisting it is generically safe)',
    () => {
      const whileIcon: IOldIcon = {
        id: 'w1',
        alias: 'while',
        block: { expression: 'x < 10' },
        children: [oldAction('a1', 'x = x + 1')],
        out: oldOut('break', 'wout'),
      };
      const actionAfter = oldAction('a2', 'y = 1');

      expect(() => convertBodyAndExit([whileIcon, actionAfter], null, ctx, 'function-body')).toThrow(
        /first statement of "function-body"/,
      );
    },
  );

  it('drops a "break"/"continue" on a "pseudo-cycle" first in its parent chain (it always runs its body exactly once)', () => {
    const pseudoCycleIcon: IOldIcon = {
      id: 'pc1',
      alias: 'pseudo-cycle',
      children: [oldAction('a1', 'x = 1')],
      out: oldOut('break', 'pcout'),
    };
    const actionAfter = oldAction('a2', 'y = 1');

    const statements = convertBodyAndExit([pseudoCycleIcon, actionAfter], null, ctx, 'function-body').children;
    expect(statements).toHaveLength(2);
    expect(statements[0].out).toBeUndefined();
    expect(() => stack.parseDocument(wrapInFunctionDocument(statements))).not.toThrow();
  });

  it(
    'hoists a "return"/"throw" on a "pseudo-cycle" first in its parent chain into the parent chain right after it ' +
      '(safe: the body always runs exactly once, unconditionally)',
    () => {
      const pseudoCycleIcon: IOldIcon = {
        id: 'pc1',
        alias: 'pseudo-cycle',
        children: [oldAction('a1', 'x = 1')],
        out: oldOut('return', 'pcout', '42'),
      };
      const actionAfter = oldAction('a2', 'y = 1');

      const statements = convertBodyAndExit([pseudoCycleIcon, actionAfter], null, ctx, 'function-body').children;
      expect(statements).toHaveLength(3);
      const [pseudoCycleNode, hoisted, actionNode] = statements;
      expect(pseudoCycleNode.name).toBe('pseudo-cycle');
      expect(pseudoCycleNode.out).toBeUndefined();
      expect(hoisted.name).toBe('return');
      expect(hoisted.data).toBe('42');
      expect(actionNode.name).toBe('action');

      expect(() => stack.parseDocument(wrapInFunctionDocument(statements))).not.toThrow();
    },
  );

  it('is a plain pass-through helper (exported directly, so a bare list with no early exit round-trips unchanged)', () => {
    const statements: INode[] = [{ id: 'a1', name: 'action', data: 'x = 1' }];
    expect(fixFirstStatementOut(statements, 'function-body')).toEqual(statements);
  });
});

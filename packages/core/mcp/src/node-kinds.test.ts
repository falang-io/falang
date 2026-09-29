import { describe, expect, it } from 'vitest';
import { NodesGroup, NodesStack, zod } from '@falang/dto';
import { functionNodesGroup, objectStructureNodes } from '@falang/typescript-dto';
import { buildNodeKindsCatalog, describeNodeKind, describeNodeKinds, getAllowedChildNames } from './node-kinds.js';

// Reuses the real `functionNodesGroup` (typescript `function` documents) instead of a hand-rolled
// test-only stack: `@falang/mcp-core` deliberately doesn't depend on `@falang/scheme` (no
// React/MobX), so the `getTestInfrastructure()` helper `packages/core/agent`'s original version of
// this test used isn't available here — see ADR 0029 (private).
const getStack = () => new NodesStack([functionNodesGroup]);

describe('node-kinds', () => {
  it('getAllowedChildNames: children === true returns every statement stack name', () => {
    const stack = getStack();
    const names = getAllowedChildNames('function-body', stack);
    const structural = new Set([
      'function-header',
      'function-body',
      'function-footer',
      'if-child',
      'switch-option',
      'parallel-thread',
    ]);
    expect(names).toEqual([...stack.configsMap.keys()].filter((name) => name !== 'function' && !structural.has(name)));
  });

  it('getAllowedChildNames: children === true excludes structural slot/option kinds', () => {
    const stack = getStack();
    const names = getAllowedChildNames('function-body', stack);
    for (const name of ['function-body', 'function-header', 'if-child', 'switch-option']) {
      expect(names).not.toContain(name);
    }
    expect(names).toContain('switch');
    expect(names).toContain('break');
  });

  it('getAllowedChildNames: a kind referenced as a child of another kind may still nest under itself', () => {
    const stack = new NodesStack([objectStructureNodes]);
    expect(getAllowedChildNames('objects-structure-child', stack)).toEqual(['objects-structure-child']);
  });

  it('getAllowedChildNames: an option kind whose body holds statements does not nest under itself', () => {
    const questionGroup = new NodesGroup([
      { name: 'q', children: ['q-option'] },
      { name: 'q-option', children: true },
    ]);
    const stack = new NodesStack([functionNodesGroup, questionGroup]);
    const names = getAllowedChildNames('q-option', stack);
    expect(names).toContain('action');
    expect(names).not.toContain('q-option');
  });

  it('getAllowedChildNames: children === true excludes documentRootOnly kinds (e.g. "function" itself)', () => {
    // Regression test: `function-body`'s `children: true` used to be read as "any node in the whole
    // stack," which included `function` itself — letting a whole document-root node be nested inside
    // its own body. A real-world instance of this same class of bug (`trigger-function` nested inside a
    // `function` document, since both share one NodesStack in the workflow product) is covered end to
    // end in `packages/workflow/backend/src/domains/mcp/workflow-mcp-registry.test.ts`.
    const stack = getStack();
    const names = getAllowedChildNames('function-body', stack);
    expect(names).not.toContain('function');
    expect(names).toContain('action');
    expect(names).toContain('if');
  });

  it('getAllowedChildNames: tuple node returns no children', () => {
    const stack = getStack();
    expect(getAllowedChildNames('function', stack)).toEqual([]);
  });

  it('getAllowedChildNames: leaf node returns no children', () => {
    const stack = getStack();
    expect(getAllowedChildNames('action', stack)).toEqual([]);
  });

  it('describeNodeKind: action has a string dataSchema', () => {
    const stack = getStack();
    const description = describeNodeKind('action', stack);
    expect(description.dataSchema).toMatchObject({ type: 'string' });
  });

  it('describeNodeKind: out has no dataSchema', () => {
    const stack = getStack();
    const description = describeNodeKind('break', stack);
    expect(description.dataSchema).toBeUndefined();
  });

  it('describeNodeKind: pseudo-cycle carries a note about its implicit trailing break', () => {
    const stack = getStack();
    const description = describeNodeKind('pseudo-cycle', stack);
    expect(description.notes).toContain('break');
  });

  it('describeNodeKind: if carries a note about trueOnRight branch direction', () => {
    const stack = getStack();
    const description = describeNodeKind('if', stack);
    expect(description.notes).toContain('trueOnRight');
  });

  it('describeNodeKind: while carries a note about trueIsMain condition direction', () => {
    const stack = getStack();
    const description = describeNodeKind('while', stack);
    expect(description.notes).toContain('trueIsMain');
  });

  it('describeNodeKind: break and return notes contrast leaving the loop with ending the function', () => {
    const stack = getStack();
    expect(describeNodeKind('break', stack).notes).toContain('after that loop');
    expect(describeNodeKind('return', stack).notes).toContain('whole function');
  });

  it('describeNodeKind: objects-structure kinds explain they declare interfaces, not storage', () => {
    const stack = new NodesStack([objectStructureNodes]);
    expect(describeNodeKind('objects-structure', stack).notes).toContain('NOT storage');
    expect(describeNodeKind('objects-structure-thread', stack).notes).toContain('"struct"');
    expect(describeNodeKind('objects-structure-child', stack).notes).toContain('variableType');
  });

  it('describeNodeKind: a node kind with no notes leaves the field undefined', () => {
    const stack = getStack();
    const description = describeNodeKind('action', stack);
    expect(description.notes).toBeUndefined();
  });

  it('buildNodeKindsCatalog: describes every registered node kind', () => {
    const stack = getStack();
    const catalog = buildNodeKindsCatalog(stack);
    expect(catalog.nodeKinds.map((d) => d.name).toSorted()).toEqual([...stack.configsMap.keys()].toSorted());
  });

  it('describeNodeKinds: hoists the shared VariableType/TypeInfo definitions out of every kind that takes a type', () => {
    const stack = getStack();
    const listing = describeNodeKinds(['create-var', 'function-body', 'action'], stack);
    expect(Object.keys(listing.$defs ?? {}).toSorted()).toEqual(['TypeInfo', 'VariableType']);
    const createVar = listing.nodeKinds.find((kind) => kind.name === 'create-var')?.dataSchema;
    expect(createVar?.$defs).toBeUndefined();
    expect(createVar?.$schema).toBeUndefined();
    expect(JSON.stringify(createVar)).toContain('"$ref":"#/$defs/VariableType"');
    expect(JSON.stringify(listing).match(/"oneOf"/g)?.length).toBe(
      JSON.stringify(listing.$defs).match(/"oneOf"/g)?.length,
    );
    const variableType = listing.$defs?.VariableType as { id?: string } | undefined;
    expect(variableType).toBeDefined();
    expect(variableType?.id).toBeUndefined();
  });

  it('describeNodeKinds: a kind-only schema still keeps its self-contained describeNodeKind form', () => {
    const stack = getStack();
    const own = describeNodeKind('create-var', stack).dataSchema as { $defs?: Record<string, unknown> };
    expect(Object.keys(own.$defs ?? {})).toContain('VariableType');
  });

  it('describeNodeKinds: omits $defs when no listed kind references a named definition', () => {
    const listing = describeNodeKinds(['action', 'break'], getStack());
    expect(listing.$defs).toBeUndefined();
    expect(listing.nodeKinds.map((kind) => kind.name)).toEqual(['action', 'break']);
  });

  it('describeNodeKinds: a named definition that differs between kinds stays inline in each', () => {
    const first = zod.object({ a: zod.string() }).meta({ id: 'NodeKindsTestConflict' });
    const second = zod.object({ b: zod.number() }).meta({ id: 'NodeKindsTestConflict' });
    const group = new NodesGroup([
      { name: 'conflict-a', data: { type: zod.object({ value: first }), default: () => ({ value: { a: '' } }) } },
      { name: 'conflict-b', data: { type: zod.object({ value: second }), default: () => ({ value: { b: 0 } }) } },
    ]);
    const listing = describeNodeKinds(['conflict-a', 'conflict-b'], new NodesStack([group]));
    expect(listing.$defs).toBeUndefined();
    for (const kind of listing.nodeKinds)
      expect(Object.keys(kind.dataSchema?.$defs ?? {})).toEqual(['NodeKindsTestConflict']);
  });

  it('buildNodeKindsCatalog: shares one TypeInfo definition across the whole catalog', () => {
    const catalog = buildNodeKindsCatalog(getStack());
    expect(catalog.$defs?.TypeInfo).toBeDefined();
    expect(
      catalog.nodeKinds.every((kind) => !(kind.dataSchema?.$defs as Record<string, unknown> | undefined)?.TypeInfo),
    ).toBe(true);
  });
});

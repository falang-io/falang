import type { INode, NodesStack } from '@falang/dto';
import { collectScopeVariables, type IScopeVariable } from '@falang/typescript-common';
import { registerGlobalTokens, schemeFactory } from '@falang/scheme';
import { MAGIC_FUNCTION_BODY_NAME } from '@falang/workflow-dto';
import { afterEach, describe, expect, it } from 'vitest';
import { getMagicTestInfrastructure } from './magic-test-harness.js';
import { buildMagicFunctionDocument, readMagicFunctionDocument } from './magic-function-document.js';
import { buildMagicFunctionIconsGroup, buildMagicIconsGroup } from './magic-icons-group.js';
import type { Scheme } from '@falang/scheme';

const steps: INode[] = [
  { id: 'a', name: 'action', data: 'one' },
  { id: 'b', name: 'action', data: 'two' },
];
const magic: INode = { id: 'm', name: 'magic', data: { spell: 'do the thing' }, children: steps, meta: { note: 'n' } };
const outerScope: IScopeVariable[] = [{ name: 'message', type: { type: 'raw', expression: 'string' } }];

describe('magic function document helpers', () => {
  it('builds a magic-function root from a magic node and reads it back', () => {
    const root = buildMagicFunctionDocument(magic, outerScope);
    expect(root.name).toBe('magic-function');
    expect(root.children?.map((c) => c.name)).toEqual([
      'magic-function-header',
      'magic-function-body',
      'magic-function-footer',
    ]);
    expect(root.children?.[0].data).toEqual({ spell: 'do the thing' });
    expect(root.children?.[1].data).toEqual({ outerScope });
    // deep clone: editing the popup tree leaves the magic node alone
    expect(root.children?.[1].children).toEqual(steps);
    expect(root.children?.[1].children?.[0]).not.toBe(steps[0]);

    const back = readMagicFunctionDocument(root);
    expect(back.spell).toBe('do the thing');
    expect(back.children).toEqual(steps);
    expect(back.children[0]).not.toBe(root.children?.[1].children?.[0]);
  });

  it('validates against the popup node stack', () => {
    const infra = getMagicTestInfrastructure(buildMagicIconsGroup(), buildMagicFunctionIconsGroup());
    const stack: NodesStack = infra.structure;
    const root = buildMagicFunctionDocument(magic, outerScope);
    expect(() => stack.parseDocument({ id: 'd', type: 'test', name: 'magic-doc', root })).not.toThrow();
  });
});

describe('popup scheme', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  afterEach(() => scheme?.dispose());

  it('opens, and outerScope is visible to collectScopeVariables inside the body', () => {
    registerGlobalTokens();
    const infra = getMagicTestInfrastructure(buildMagicIconsGroup(), buildMagicFunctionIconsGroup());
    const root = buildMagicFunctionDocument(magic, outerScope);
    scheme = schemeFactory({ infra, document: { id: 'd', type: 'test', name: 'magic-doc', root } });
    const body = scheme.rootNode?.children.find((c) => c.name === MAGIC_FUNCTION_BODY_NAME);
    expect(body).toBeTruthy();
    expect(scheme.icons.getIconSafe('a')).not.toBeNull();
    const inside = collectScopeVariables(scheme.nodes.getNode('b'));
    expect(inside.map((v) => v.name)).toContain('message');
  });
});

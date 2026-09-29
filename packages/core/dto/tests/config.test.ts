// oxlint-disable typescript/no-non-null-assertion
// oxlint-disable typescript/no-explicit-any
import { assert, describe, it } from 'vitest';
import * as zod from 'zod';
import type { INode } from '../src';
import { cycle, ifCfg, NodesGroup, NodesStack } from '../src';
import { action, switchCfg, functionCfg } from '../src';
import { defaultFactory } from '../src/default-factory.ts';

describe('Base config test', () => {
  const stringType = { type: zod.string(), default: () => '' };
  const numberType = { type: zod.number(), default: () => 0 };
  const booleanType = { type: zod.number(), default: () => 0 };

  it('create and parse', () => {
    const group = new NodesGroup([
      action('action', stringType),
      action('action2', numberType),
      action('action3', numberType),
      action('mod1', numberType),
      action('out', numberType),
      cycle('cycle', numberType),
      ...switchCfg({
        name: 'switch',
        data: booleanType,
        optionData: booleanType,
      }),
      ...functionCfg({
        name: 'function',
        data: stringType,
        footer: stringType,
        header: stringType,
      }),
      ...ifCfg('if', stringType),
    ]);

    const stack = new NodesStack([group]);

    assert.throw(() => stack.parseNode({}));

    const func = stack.parseNode({
      id: '',
      name: 'function',
      children: [
        {
          id: '1',
          name: 'function-header',
          data: '',
        },
        {
          id: '2',
          name: 'function-body',
          data: '',
          children: [
            {
              id: '3',
              name: 'action',
              data: '',
              mods: [
                {
                  id: '',
                  name: 'mod1',
                  data: 0,
                },
              ],
            },
            {
              id: '4',
              name: 'if',
              data: '',
              children: [
                {
                  id: '7',
                  name: 'if-child',
                  children: [
                    {
                      id: '5',
                      name: 'action',
                      data: '',
                    },
                  ],
                },
                {
                  id: '7',
                  name: 'if-child',
                  children: [
                    {
                      id: '5',
                      name: 'action',
                      data: '',
                    },
                  ],
                  out: {
                    id: '6',
                    name: 'out',
                    data: 0,
                  },
                },
              ],
            },
          ],
        },
        {
          id: '1',
          name: 'function-footer',
          data: '',
        },
      ],
    });

    assert.equal(func.name, 'function');
    const body = func.children!.find((item) => item.name === 'function-body');
    const child = body?.children![0] as INode;
    assert.equal(child.name, 'action');
    assert.equal((child.mods || [])[0].name, 'mod1');
    const child2 = ((body as any).children[1] as any).children[1] as INode;
    assert.equal(child2.out?.name, 'out');

    const ifNodeConfig = stack.factory('if');
    stack.parseNode(ifNodeConfig);

    const functionNodeConfig = stack.factory('function');
    const functionNode = stack.parseNode(functionNodeConfig);
    assert.equal(functionNode.name, 'function');

    const switchNodeConfig = stack.factory('switch');
    stack.parseNode(switchNodeConfig);

    const actionNodeConfig = stack.getConfig('action');
    const actionNode = defaultFactory(actionNodeConfig);
    assert.equal(actionNode.name, 'action');

    const ifOptionNodeConfig = stack.getConfig('if-child');
    const ifOptionNode = defaultFactory(ifOptionNodeConfig);
    assert.equal(ifOptionNode.name, 'if-child');
  });
});

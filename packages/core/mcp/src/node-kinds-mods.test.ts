import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { NodesGroup, NodesStack, action, functionCfg, modCfg, zod } from '@falang/dto';
import { DocumentStackRegistry } from './stack-registry.js';
import { describeNodeKind, getAllowedChildNames } from './node-kinds.js';
import { validateDocument } from './validate-document.js';

const stringType = { type: zod.string(), default: () => '' };

const getStack = () =>
  new NodesStack([
    new NodesGroup([
      action('action', stringType, { mods: ['timer'] }),
      modCfg('timer', stringType),
      ...functionCfg({ name: 'function', data: stringType, footer: stringType, header: stringType }),
    ]),
  ]);

describe('node kinds and mods', () => {
  it('describes the mods a host accepts', () => {
    const stack = getStack();
    expect(describeNodeKind('action', stack).mods).toEqual(['timer']);
    expect(describeNodeKind('function', stack).mods).toBeUndefined();
  });

  it('attaches the timer note', () => {
    expect(describeNodeKind('timer', getStack()).notes).toContain('mods');
  });

  it('never offers a mod-only kind as a child', () => {
    const names = getAllowedChildNames('function-body', getStack());
    expect(names).toContain('action');
    expect(names).not.toContain('timer');
  });

  it('validateDocument rejects a document with a mod-only kind inside children', () => {
    const stack = getStack();
    const registry = new DocumentStackRegistry();
    registry.registerProjectType('p', { function: { rootNodeName: 'function', stack } });
    const make = (child: unknown): IProjectDocument => ({
      id: 'd',
      name: 'd',
      type: 'function',
      root: {
        id: 'f',
        name: 'function',
        children: [
          { id: 'h', name: 'function-header', data: '' },
          { id: 'b', name: 'function-body', data: '', children: [child as INode] },
          { id: 'ft', name: 'function-footer', data: '' },
        ],
      },
    });
    const timer = { id: 't', name: 'timer', data: '' };
    expect(validateDocument('p', make({ id: 'a', name: 'action', data: '', mods: [timer] }), registry).ok).toBe(true);
    expect(validateDocument('p', make(timer), registry).ok).toBe(false);
  });
});

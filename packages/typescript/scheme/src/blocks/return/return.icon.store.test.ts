import { container as rootContainer } from '@falang/di';
import { BLOCK_DEFAULT_WIDTH, CELL_SIZE, CELL_SIZE_2, CELL_SIZE_4, registerGlobalTokens } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { afterEach, describe, expect, it } from 'vitest';
import { functionalSchemeFactory } from '../../functional.js';
import { ReturnIconStore } from './return.icon.store.js';

const buildRoot = (returnValue: unknown, returnMeta?: INode['meta']): INode => ({
  id: 'fn',
  name: 'function',
  children: [
    { id: 'h', name: 'function-header', data: '' },
    {
      id: 'body',
      name: 'function-body',
      data: { parameters: [], returnValue },
      children: [{ id: 'a', name: 'action', data: '' }],
      out: { id: 'ret', name: 'return', data: '', meta: returnMeta ?? {} },
    },
    { id: 'f', name: 'function-footer', data: '' },
  ],
});

describe('ReturnIconStore', () => {
  // oxlint-disable-next-line init-declarations
  let dispose: () => void;
  afterEach(() => dispose?.());

  const build = (returnValue: unknown, returnMeta?: INode['meta']): ReturnIconStore => {
    registerGlobalTokens();
    const scheme = functionalSchemeFactory({
      parentContainer: rootContainer,
      document: { id: 'd', type: 'function', name: 'doc', root: buildRoot(returnValue, returnMeta) },
    });
    dispose = () => scheme.dispose();
    const icon = scheme.icons.getIcon('ret');
    if (!(icon instanceof ReturnIconStore)) throw new Error('return icon expected');
    return icon;
  };

  it('is one cell high, four cells wide and not resizable in a void function, whatever meta.width says', () => {
    const icon = build({ type: 'void' }, { width: 300 });
    expect(icon.returnsValue).toBe(false);
    expect(icon.blockWidth).toBe(CELL_SIZE_4);
    expect(icon.blockMinHeight).toBe(CELL_SIZE);
    expect(icon.blockResizable).toBe(false);
  });

  it('is a resizable two-cell block in a value-returning function, keeping the user width', () => {
    const icon = build({ type: 'number', numberType: { type: 'any' } }, { width: 300 });
    expect(icon.returnsValue).toBe(true);
    expect(icon.blockWidth).toBe(300);
    expect(icon.blockMinHeight).toBe(CELL_SIZE_2);
    expect(icon.blockResizable).toBe(true);
  });

  it('uses the default width in a value-returning function without meta.width', () => {
    const icon = build({ type: 'number', numberType: { type: 'any' } });
    expect(icon.blockWidth).toBe(BLOCK_DEFAULT_WIDTH);
  });
});

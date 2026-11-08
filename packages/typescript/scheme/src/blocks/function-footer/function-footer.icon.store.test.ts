import { container as rootContainer } from '@falang/di';
import { CELL_SIZE_4, registerGlobalTokens } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { afterEach, describe, expect, it } from 'vitest';
import { functionalSchemeFactory } from '../../functional.js';
import { functionFooterBlockConfig } from './function-footer.block.config.js';
import { FunctionFooterIconStore } from './function-footer.icon.store.js';

const buildRoot = (footerMeta?: INode['meta']): INode => ({
  id: 'fn',
  name: 'function',
  children: [
    { id: 'h', name: 'function-header', data: '' },
    { id: 'body', name: 'function-body', data: { parameters: [], returnValue: { type: 'void' } }, children: [] },
    { id: 'f', name: 'function-footer', data: 'legacy text', meta: footerMeta ?? {} },
  ],
});

describe('FunctionFooterIconStore', () => {
  // oxlint-disable-next-line init-declarations
  let dispose: () => void;
  afterEach(() => dispose?.());

  const build = (footerMeta?: INode['meta']): FunctionFooterIconStore => {
    registerGlobalTokens();
    const scheme = functionalSchemeFactory({
      parentContainer: rootContainer,
      document: { id: 'd', type: 'function', name: 'doc', root: buildRoot(footerMeta) },
    });
    dispose = () => scheme.dispose();
    const icon = scheme.icons.getIcon('f');
    if (!(icon instanceof FunctionFooterIconStore)) throw new Error('function footer icon expected');
    return icon;
  };

  it('is four cells wide and not resizable, whatever meta.width says', () => {
    const icon = build({ width: 300 });
    expect(icon.blockWidth).toBe(CELL_SIZE_4);
    expect(icon.blockResizable).toBe(false);
  });

  it('is four cells wide without meta.width', () => {
    expect(build().blockWidth).toBe(CELL_SIZE_4);
  });

  it('has no editor', () => {
    expect('editor' in functionFooterBlockConfig).toBe(false);
  });
});

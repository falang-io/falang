import { container as rootContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { CMD_SET_DATA, registerGlobalTokens } from '@falang/scheme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowFunctionalSchemeFactory } from '../workflow-functional-scheme-factory.js';
import { buildMagicFunctionDocument } from './magic-function-document.js';
import { magicFunctionSchemeFactory } from './magic-function-scheme-factory.js';

// The real factories pull monaco-editor in through `@falang/typescript-scheme` (needs a browser at import time);
// nothing exercised here touches it.
vi.mock('monaco-editor', () => ({ editor: {}, languages: { typescript: {} }, Uri: {}, KeyCode: {}, KeyMod: {} }));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker.js?worker', () => ({ default: vi.fn() }));
vi.mock('../../../../typescript/scheme/src/monaco/get-monaco.js', () => ({
  getMonaco: () => ({}),
  setMonacoLibVariant: vi.fn(),
}));
vi.mock('../../../../typescript/scheme/src/monaco/use-code-theme.js', () => ({ useCodeTheme: () => 'vs' }));

const params = { parentContainer: rootContainer, integrations: [] };

const fnDoc = (bodyChildren: INode[]) => ({
  id: 'doc',
  type: 'function',
  name: 'fn',
  root: {
    id: 'root',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: { parameters: [] }, children: bodyChildren },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
});

describe('workflow scheme factories and the magic node', () => {
  const schemes: { dispose(): void }[] = [];
  afterEach(() => schemes.splice(0).forEach((s) => s.dispose()));

  it('opens a document holding a magic node with children, drawn as one block', () => {
    registerGlobalTokens();
    const magic: INode = {
      id: 'm',
      name: 'magic',
      data: { spell: 'greet' },
      children: [{ id: 'x', name: 'action', data: 'noop()' }],
    };
    const scheme = workflowFunctionalSchemeFactory({ ...params, document: fnDoc([magic]) });
    schemes.push(scheme);
    expect(scheme.icons.getIconSafe('m')).not.toBeNull();
    expect(scheme.icons.getIconSafe('x')).toBeNull();
  });

  it('builds the popup scheme from a magic node and accepts edits to its body', () => {
    registerGlobalTokens();
    const magic: INode = {
      id: 'm',
      name: 'magic',
      data: { spell: 'greet' },
      children: [{ id: 'x', name: 'action', data: 'noop()' }],
    };
    const root = buildMagicFunctionDocument(magic, []);
    const onHeader = vi.fn();
    const scheme = magicFunctionSchemeFactory({
      ...params,
      document: { id: 'popup', type: 'magic-function', name: 'popup', root },
      onHeaderSpellCommitted: onHeader,
    });
    schemes.push(scheme);
    expect(scheme.icons.getIconSafe('x')).not.toBeNull();
    expect(scheme.rootNode?.children.map((c) => c.name)).toEqual([
      'magic-function-header',
      'magic-function-body',
      'magic-function-footer',
    ]);
    const headerId = scheme.rootNode?.children[0].id ?? '';
    scheme.commands.dispatchCommand(CMD_SET_DATA, { id: headerId, data: { spell: 'greet loudly' } });
    expect(onHeader).toHaveBeenCalledWith('greet', 'greet loudly');
  });
});

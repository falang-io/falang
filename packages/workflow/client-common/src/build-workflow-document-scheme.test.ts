import { container, resolveService } from '@falang/di';
import { CMD_INSERT_NODE, TOKEN_COPY_PASTE, TOKEN_HISTORY, registerGlobalTokens } from '@falang/scheme';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildWorkflowDocumentScheme,
  canPasteBetweenWorkflowDocuments,
  WORKFLOW_PROJECT_TYPE,
} from './build-workflow-document-scheme.js';
import type { Scheme } from '@falang/scheme';

const bodyOf = (scheme: Scheme) => {
  const body = scheme.rootNode?.children.find((child) => child.name.endsWith('-body'));
  if (!body) throw new Error('no body');
  return body;
};
const at = (documentType: string, projectType = WORKFLOW_PROJECT_TYPE) => ({ projectType, documentType });

describe('buildWorkflowDocumentScheme', () => {
  const schemes: Scheme[] = [];
  afterEach(() => {
    for (const scheme of schemes.splice(0)) scheme.dispose();
  });

  const build = (type: string, extra: Partial<Parameters<typeof buildWorkflowDocumentScheme>[0]> = {}) => {
    registerGlobalTokens();
    const scheme = buildWorkflowDocumentScheme({
      doc: { id: 'd1', name: 'doc', type },
      getCredentialInstances: () => [],
      parentContainer: container,
      ...extra,
    });
    schemes.push(scheme);
    return scheme;
  };

  it('builds a function document with the stack default root, workflow node kinds and a history module', () => {
    const scheme = build('function');
    expect(scheme.rootNode?.name).toBe('function');
    expect(() => scheme.infra.structure.factory('magic')).not.toThrow();
    expect(() => scheme.infra.structure.factory('telegram-send-message')).not.toThrow();
    expect(() => scheme.infra.structure.factory('no-such-kind')).toThrow();
    expect(scheme.container.isRegistered(TOKEN_HISTORY, true)).toBe(true);
  });

  it('builds a trigger-function and an objects-structure document with their own roots (both agent-editable)', () => {
    expect(build('trigger-function').rootNode?.name).toBe('trigger-function');
    const structure = build('objects-structure');
    expect(structure.rootNode?.name).toBe('objects-structure');
    expect(structure.container.isRegistered(TOKEN_HISTORY, true)).toBe(true);
  });

  it('uses the stored root when the document has one, and runs onSchemeCreated before the root is set', () => {
    let rootAtCallback: unknown = 'unset';
    const probe = build('function');
    const stored = {
      children: [
        { id: 'h', name: 'function-header', data: '' },
        { children: [{ data: 'x = 1', id: 'a1', name: 'action' }], data: '', id: 'b', name: 'function-body' },
        { id: 'f', name: 'function-footer', data: '' },
      ],
      id: 'root-1',
      name: 'function',
    };
    const scheme = build('function', {
      doc: { data: stored, id: 'd2', name: 'doc2', type: 'function' },
      onSchemeCreated: (created) => {
        rootAtCallback = created.rootNode;
      },
    });
    expect(probe.rootNode?.id).not.toBe('root-1');
    expect(scheme.rootNode?.id).toBe('root-1');
    expect(scheme.nodes.getNodeSafe('a1')?.data).toBe('x = 1');
    expect(rootAtCallback).toBeNull();
  });

  it('copies icons between function and trigger-function documents with fresh ids, never into a structure', () => {
    const fn = build('function');
    const trigger = build('trigger-function', { doc: { id: 'd3', name: 'onMessage', type: 'trigger-function' } });
    const structure = build('objects-structure', { doc: { id: 'd4', name: 'T', type: 'objects-structure' } });
    const action = { ...fn.infra.structure.factory('action'), data: 'x = 1' };
    fn.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: bodyOf(fn).id, index: 0, node: action });

    const source = resolveService(TOKEN_COPY_PASTE, fn.container);
    expect(source.origin).toEqual({ projectType: WORKFLOW_PROJECT_TYPE, documentType: 'function' });
    expect(source.getCopyIds(action.id)).toEqual([action.id]);
    expect(source.copy([action.id])?.documentType).toBe('function');

    const target = resolveService(TOKEN_COPY_PASTE, trigger.container);
    const triggerBody = bodyOf(trigger);
    const [pasted] = target.paste(triggerBody.id, 0);
    expect(pasted).toBeDefined();
    expect(pasted).not.toBe(action.id);
    expect(trigger.nodes.getNode(pasted).data).toBe('x = 1');

    expect(resolveService(TOKEN_COPY_PASTE, structure.container).getPastePayload()).toBeNull();
  });

  it('canPasteBetweenWorkflowDocuments: same type, or function ↔ trigger-function, within one project type', () => {
    expect(canPasteBetweenWorkflowDocuments(at('function'), at('trigger-function'))).toBe(true);
    expect(canPasteBetweenWorkflowDocuments(at('trigger-function'), at('function'))).toBe(true);
    expect(canPasteBetweenWorkflowDocuments(at('objects-structure'), at('objects-structure'))).toBe(true);
    expect(canPasteBetweenWorkflowDocuments(at('function'), at('objects-structure'))).toBe(false);
    expect(canPasteBetweenWorkflowDocuments(at('function', 'logic'), at('function'))).toBe(false);
  });
});

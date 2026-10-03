import { container, resolveService } from '@falang/di';
import { CMD_SET_DATA, registerGlobalTokens, type Scheme } from '@falang/scheme';
import { registerTypescriptProjectService, TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkflowDocumentScheme } from './build-workflow-document-scheme.js';
import { subscribeWorkflowDocumentSync, syncWorkflowDocumentFromScheme } from './sync-document-from-scheme.js';
import type { WorkflowDocument } from './workflow-types.js';

describe('syncWorkflowDocumentFromScheme / subscribeWorkflowDocumentSync', () => {
  const schemes: Scheme[] = [];
  afterEach(() => {
    for (const scheme of schemes.splice(0)) scheme.dispose();
  });

  const setup = (type: 'function' | 'objects-structure') => {
    registerGlobalTokens();
    const projectContainer = container.createChildContainer();
    registerTypescriptProjectService(projectContainer);
    const typesRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, projectContainer).typesRegistry;
    const doc: WorkflowDocument = { folderId: null, id: 'd1', name: 'doc', type };
    const scheme = buildWorkflowDocumentScheme({
      doc,
      getCredentialInstances: () => [],
      parentContainer: projectContainer,
    });
    schemes.push(scheme);
    return { doc, scheme, typesRegistry };
  };

  it('syncs doc.data from the live tree and returns it', () => {
    const { doc, scheme, typesRegistry } = setup('function');
    expect(doc.data).toBeUndefined();
    const root = syncWorkflowDocumentFromScheme(doc, scheme, typesRegistry);
    expect(root?.name).toBe('function');
    expect(doc.data).toBe(root);
  });

  it('on every change updates doc.data and re-registers an objects-structure document’s interfaces', () => {
    const { doc, scheme, typesRegistry } = setup('objects-structure');
    const onSynced = vi.fn();
    subscribeWorkflowDocumentSync(doc, scheme, typesRegistry, onSynced);
    const thread = scheme.rootNode?.children[1]?.children[0];
    if (!thread) throw new Error('no placeholder interface');

    scheme.commands.dispatchCommand(CMD_SET_DATA, { data: 'PlayerState', id: thread.id });

    expect(onSynced).toHaveBeenCalled();
    expect(doc.data?.children?.[1]?.children?.[0]?.data).toBe('PlayerState');
    expect([...typesRegistry.types.values()].map((item) => item.name)).toContain('PlayerState');
  });
});

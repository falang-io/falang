import { describe, expect, it } from 'vitest';
import { NodesGroup, NodesStack, zod, type IDataInfo } from '@falang/dto';
import { validateDocument } from './validate-document.js';
import { createDefaultDocumentStackRegistry, DocumentStackRegistry } from './stack-registry.js';

describe('DocumentStackRegistry', () => {
  it('registerProjectType adds document types, mergeable across calls', () => {
    const registry = new DocumentStackRegistry();
    const stringType = { default: () => '', type: zod.string() } as const satisfies IDataInfo;
    const stack = new NodesStack([new NodesGroup([{ data: stringType, name: 'leaf' }])]);
    registry.registerProjectType('custom', { leaf: { rootNodeName: 'leaf', stack } });
    expect(registry.getProjectTypes()).toContain('custom');
    expect(registry.getDocumentTypes('custom')).toEqual(['leaf']);
    expect(registry.getStack('custom', 'leaf')).toBe(stack);

    // a second call merges rather than replacing
    const stack2 = new NodesStack([new NodesGroup([{ data: stringType, name: 'leaf2' }])]);
    registry.registerProjectType('custom', { leaf2: { rootNodeName: 'leaf2', stack: stack2 } });
    expect(registry.getDocumentTypes('custom').toSorted()).toEqual(['leaf', 'leaf2']);
  });

  it('getStack/getDefaultRoot return undefined for an unknown project or document type', () => {
    const registry = new DocumentStackRegistry();
    expect(registry.getStack('nope', 'nope')).toBeUndefined();
    expect(registry.getDefaultRoot('nope', 'nope')).toBeUndefined();
  });

  describe('createDefaultDocumentStackRegistry', () => {
    const registry = createDefaultDocumentStackRegistry();

    it('registers all 7 desktop-app project types plus "workflow"', () => {
      expect(registry.getProjectTypes().toSorted()).toEqual(
        [
          'text',
          'logic',
          'simple-code-cpp',
          'simple-code-js',
          'simple-code-ts',
          'simple-code-php',
          'simple-code-rust',
          'workflow',
        ].toSorted(),
      );
    });

    it('registers the desktop-app "text" project type with its three document types', () => {
      expect(registry.getDocumentTypes('text').toSorted()).toEqual(
        ['contour', 'text-function', 'mind-tree'].toSorted(),
      );
    });

    it('validates a text-domain `function`-rooted default document under "text"/"text-function"', () => {
      const root = registry.getDefaultRoot('text', 'text-function');
      expect(root?.name).toBe('function');
      const result = validateDocument('text', { id: 'doc-1', name: 'Main', type: 'text-function', root }, registry);
      expect(result.ok).toBe(true);
    });

    it('registers the desktop-app "logic" project type with its four document types', () => {
      expect(registry.getDocumentTypes('logic').toSorted()).toEqual(
        ['function', 'objects-structure', 'enum-structure', 'external-api-structure'].toSorted(),
      );
    });

    it('registers one "simple-code-<language>" project type per language, each with one matching document type', () => {
      for (const language of ['cpp', 'js', 'ts', 'php', 'rust']) {
        const projectType = `simple-code-${language}`;
        expect(registry.getDocumentTypes(projectType)).toEqual([projectType]);
      }
    });

    it('every registered document type has a stack that knows its own root node and a default tree with that name', () => {
      for (const projectType of registry.getProjectTypes()) {
        for (const documentType of registry.getDocumentTypes(projectType)) {
          const stack = registry.getStack(projectType, documentType);
          expect(stack).toBeDefined();
          const root = registry.getDefaultRoot(projectType, documentType);
          expect(root).toBeDefined();
          expect(stack?.configsMap.has(root?.name ?? '')).toBe(true);
        }
      }
    });

    it('registers the workflow project type\'s "function" document', () => {
      const stack = registry.getStack('workflow', 'function');
      expect(stack).toBeDefined();
      expect(stack?.configsMap.has('function')).toBe(true);
      expect(stack?.configsMap.has('trigger-function')).toBe(true);
      const root = registry.getDefaultRoot('workflow', 'function');
      expect(root?.name).toBe('function');
    });

    it('accepts a comment node in a workflow function body', () => {
      const result = validateDocument(
        'workflow',
        {
          id: 'doc',
          type: 'function',
          name: 'withComment',
          root: {
            id: 'root',
            name: 'function',
            children: [
              { id: 'h', name: 'function-header', data: '' },
              {
                id: 'b',
                name: 'function-body',
                data: { parameters: [] },
                children: [{ id: 'c', name: 'comment', data: 'Why this step exists' }],
              },
              { id: 'f', name: 'function-footer', data: '' },
            ],
          },
        },
        registry,
      );
      expect(result.ok).toBe(true);
    });

    it('registers the workflow project type\'s "trigger-function" document sharing the same stack', () => {
      const functionStack = registry.getStack('workflow', 'function');
      const triggerStack = registry.getStack('workflow', 'trigger-function');
      expect(triggerStack).toBe(functionStack);
      const root = registry.getDefaultRoot('workflow', 'trigger-function');
      expect(root?.name).toBe('trigger-function');
    });

    it('registers the workflow project type\'s "objects-structure" document', () => {
      const root = registry.getDefaultRoot('workflow', 'objects-structure');
      expect(root?.name).toBe('objects-structure');
    });
  });
});

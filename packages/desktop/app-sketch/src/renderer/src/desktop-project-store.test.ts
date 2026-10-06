// @vitest-environment jsdom
// oxlint-disable max-lines -- crossed 300 lines with the new "function name validation" describe
// block; not accumulated complexity worth splitting the file over.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { resolveService } from '@falang/di';
import { CMD_INSERT_NODE } from '@falang/scheme';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import { DesktopProjectStore } from './desktop-project-store.js';

/**
 * A minimal `objects-structure` document tree — one thread named `Address` holding one property
 * (`street`) — shaped exactly the way `updateTypesRegistryFromINode` (see
 * `@falang/typescript-scheme`'s `utils/update-types-registry-from-i-node.ts`) reads it: header at
 * `children[0]`, body at `children[1]`, one thread per struct, one child per property.
 */
const buildObjectsStructureRoot = (): INode => ({
  id: 'structure-root',
  name: OBJECTS_STRUCTURE_NAME,
  data: '',
  children: [
    { id: 'structure-header', name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
    {
      id: 'structure-body',
      name: `${OBJECTS_STRUCTURE_NAME}-body`,
      data: null,
      children: [
        {
          id: 'structure-thread-address',
          name: `${OBJECTS_STRUCTURE_NAME}-thread`,
          data: 'Address',
          children: [
            {
              id: 'structure-child-street',
              name: `${OBJECTS_STRUCTURE_NAME}-child`,
              data: { name: 'street', variableType: { type: 'string' } },
              children: [],
            },
          ],
        },
      ],
    },
  ],
});

/** Builds one `objects-structure` document (never opened in a tab by any test here) plus the fake
 * `globalThis.falang` covering only what `DesktopProjectStore`'s constructor touches
 * (`project.listTree`, `document.read`/`delete`, `logicExport.readConfig`, and both export
 * channels' `onProgress` subscriptions). */
const setUpProjectWithStructureDoc = (structureDocId: string): void => {
  const structureRoot = buildObjectsStructureRoot();
  const document: IProjectDocument = {
    id: structureDocId,
    type: 'objects-structure',
    name: 'My Structures',
    root: structureRoot,
  };
  const tree: IProjectTree = {
    folders: [],
    documents: [{ id: structureDocId, type: 'objects-structure', name: 'My Structures', folderId: null }],
  };
  (globalThis as { falang?: unknown }).falang = {
    project: {
      listTree: vi.fn().mockResolvedValue(tree),
      // No real `main` process in this test — `onChanged` just needs to hand back an unsubscribe.
      onChanged: vi.fn().mockReturnValue(vi.fn()),
    },
    document: {
      read: vi.fn().mockResolvedValue(document),
      delete: vi.fn().mockResolvedValue(null),
    },
    locks: {
      read: vi.fn().mockResolvedValue([]),
    },
    logicExport: {
      readConfig: vi.fn().mockResolvedValue(null),
      // No real `main` process in this test — same posture as `project.onChanged` above.
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    },
    codeExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    },
  };
};

/** Same as `setUpProjectWithStructureDoc`'s fake `globalThis.falang`, but for a brand-new project with no folders/documents at all — also stubs `document.create` so tests can assert it was (not) called. */
const setUpEmptyProject = (): void => {
  const tree: IProjectTree = { documents: [], folders: [] };
  (globalThis as { falang?: unknown }).falang = {
    document: {
      create: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      read: vi.fn(),
    },
    locks: {
      read: vi.fn().mockResolvedValue([]),
    },
    project: {
      listTree: vi.fn().mockResolvedValue(tree),
      onChanged: vi.fn().mockReturnValue(vi.fn()),
    },
    logicExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
      readConfig: vi.fn().mockResolvedValue(null),
    },
    codeExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    },
  };
};

/** Same shape, but the project already has exactly one (`contour`) document — for the "auto-open the only tab" test. */
const setUpSingleDocProject = (documentId: string): void => {
  const root: INode = { id: 'contour-root', name: 'contour' };
  const document: IProjectDocument = { id: documentId, name: 'Existing', root, type: 'contour' };
  const tree: IProjectTree = {
    documents: [{ id: documentId, folderId: null, name: 'Existing', type: 'contour' }],
    folders: [],
  };
  (globalThis as { falang?: unknown }).falang = {
    document: {
      create: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      read: vi.fn().mockResolvedValue(document),
    },
    locks: {
      read: vi.fn().mockResolvedValue([]),
    },
    project: {
      listTree: vi.fn().mockResolvedValue(tree),
      onChanged: vi.fn().mockReturnValue(vi.fn()),
    },
    logicExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
      readConfig: vi.fn().mockResolvedValue(null),
    },
    codeExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
    },
  };
};

describe('DesktopProjectStore — project-wide typesRegistry sync', () => {
  it('populates TypesRegistryStore from an objects-structure document that was never opened in a tab', async () => {
    setUpProjectWithStructureDoc('structure-doc-1');
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      // The tab for `structureDocId` is never opened — `getScheme`/`buildScheme` is never called
      // for it — the whole point of this test: the sync must not depend on that path.
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));

      const typesRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, store.container).typesRegistry;
      await vi.waitFor(() => {
        expect(Array.from(typesRegistry.types.values()).some((t) => t.name === 'Address')).toBe(true);
      });
      const struct = Array.from(typesRegistry.types.values()).find((t) => t.name === 'Address');
      expect(struct?.properties.street).toEqual({ type: 'string' });
    } finally {
      store.dispose();
    }
  });

  it('removes a structure document’s types once the document is deleted from the project', async () => {
    const structureDocId = 'structure-doc-2';
    setUpProjectWithStructureDoc(structureDocId);
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));

      const typesRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, store.container).typesRegistry;
      await vi.waitFor(() => {
        expect(Array.from(typesRegistry.types.values()).some((t) => t.name === 'Address')).toBe(true);
      });

      store.deleteDocument(structureDocId);

      await vi.waitFor(() => {
        expect(typesRegistry.types.size).toBe(0);
      });
    } finally {
      store.dispose();
    }
  });
});

// See ADR 0005 (private)'s "Implementation notes (project types, new-project dialog, single
// default document — 2026-09-20)": `loadTree()` used to create a `contour`/"Main" document itself
// whenever the tree came back empty, which raced badly under React StrictMode's dev-only double
// `DesktopProjectStore` construction (both instances saw an empty tree and both created one). That
// heuristic is gone — a brand-new project's default document is created once, up front, by
// `project-actions.ts`'s `createNewProject`, before `DesktopProjectStore` even exists — `loadTree()`
// now only ever *reads* the tree, at most auto-opening a tab if there's exactly one document.
describe('DesktopProjectStore — loadTree', () => {
  it('creates no document when the project tree is empty', async () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'text');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      expect(globalThis.falang.document.create).not.toHaveBeenCalled();
      expect(store.documents.length).toBe(0);
      expect(store.openTabIds).toEqual([]);
    } finally {
      store.dispose();
    }
  });

  it('opens the tab of a project’s one document automatically', async () => {
    setUpSingleDocProject('only-doc');
    const store = new DesktopProjectStore('/fake/project', 'text');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      await vi.waitFor(() => expect(store.openTabIds).toEqual(['only-doc']));
      expect(store.activeTabId).toBe('only-doc');
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — allowedDocumentTypes', () => {
  it('restricts to the "text" project type’s three document types', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'text');
    try {
      expect(store.allowedDocumentTypes.toSorted()).toEqual(['text-function', 'contour', 'mind-tree'].toSorted());
    } finally {
      store.dispose();
    }
  });

  it('restricts to the "logic" project type’s four document types', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(store.allowedDocumentTypes.toSorted()).toEqual(
        ['function', 'objects-structure', 'enum-structure', 'external-api-structure'].toSorted(),
      );
    } finally {
      store.dispose();
    }
  });

  it('restricts a "simple-code-cpp" project to just that one document type', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'simple-code-cpp');
    try {
      expect(store.allowedDocumentTypes).toEqual(['simple-code-cpp']);
    } finally {
      store.dispose();
    }
  });

  it('falls back to every document type for an unknown/legacy project type', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'some-legacy-type-from-before-this-feature');
    try {
      expect(store.allowedDocumentTypes.toSorted()).toEqual(
        [
          'contour',
          'text-function',
          'mind-tree',
          'function',
          'objects-structure',
          'enum-structure',
          'external-api-structure',
          'simple-code-cpp',
          'simple-code-js',
          'simple-code-ts',
          'simple-code-php',
          'simple-code-rust',
        ].toSorted(),
      );
    } finally {
      store.dispose();
    }
  });
});

// A `function` document's name is compiled verbatim into a real C++/TS identifier (see
// `@falang/logic-constructor`) — these guard the store level in addition to `ProjectTree`'s own UI
// check, since `createDocument`/`renameDocument` optimistically mutate `this.documents` before the
// IPC call to `main` even resolves, with no rollback on a rejected `document.create`/`.rename`.
describe('DesktopProjectStore — function name validation', () => {
  it('rejects a "function" document name that is not a camelCase English identifier, without touching state', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(() => store.createDocument('function', 'Мой бот')).toThrow(/camelCase/);
      expect(store.documents.length).toBe(0);
      expect(globalThis.falang.document.create).not.toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });

  it('accepts a valid camelCase "function" document name', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const id = store.createDocument('function', 'myFunctionName');
      expect(store.getDocument(id)?.name).toBe('myFunctionName');
    } finally {
      store.dispose();
    }
  });

  it('does not gate a non-"function" document type\'s name (e.g. "objects-structure")', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(() => store.createDocument('objects-structure', 'Мои структуры')).not.toThrow();
    } finally {
      store.dispose();
    }
  });

  it('rejects renaming a "function" document to a name that is not a camelCase English identifier', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const id = store.createDocument('function', 'myFunctionName');
      expect(() => store.renameDocument(id, 'Мой бот')).toThrow(/camelCase/);
      expect(store.getDocument(id)?.name).toBe('myFunctionName');
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private) §3 — the project-level right sidebar's
// toggle, replacing the old `historyPanelOpen`/`toggleHistoryPanel` pair.
describe('DesktopProjectStore — toggleRightPanel', () => {
  it('starts closed', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(store.rightPanel).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('opens the given panel, then closes it on a second toggle of the same panel', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      store.toggleRightPanel('agent');
      expect(store.rightPanel).toBe('agent');
      store.toggleRightPanel('agent');
      expect(store.rightPanel).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('switches from one panel straight to the other, without an intermediate close', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      store.toggleRightPanel('agent');
      store.toggleRightPanel('history');
      expect(store.rightPanel).toBe('history');
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private) §5, "no home document" amendment — the agent's active document is just an id
// now, replacing the old `getAgentHome()` scheme+documentId pair.
describe('DesktopProjectStore — getAgentActiveDocumentId', () => {
  it('returns null when no tab is open', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(store.getAgentActiveDocumentId()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('returns null for a document type the agent can’t edit (e.g. "objects-structure")', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      store.createDocument('objects-structure', 'MyStructures');
      expect(store.getAgentActiveDocumentId()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('returns the active "function" document\'s id', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const id = store.createDocument('function', 'myFunctionName');
      expect(store.getAgentActiveDocumentId()).toBe(id);
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private) §5 — `agentSession`'s `documentResolver`, over the project's own documents.
describe('DesktopProjectStore — agentDocumentResolver', () => {
  it('throws for an unknown document id', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(() => store.agentDocumentResolver.resolve('does-not-exist')).toThrow();
    } finally {
      store.dispose();
    }
  });

  it('throws for a document type the agent can’t edit (e.g. "objects-structure")', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const id = store.createDocument('objects-structure', 'MyStructures');
      expect(() => store.agentDocumentResolver.resolve(id)).toThrow();
    } finally {
      store.dispose();
    }
  });

  it('resolves an agent-capable document (e.g. "function") to its Scheme', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const id = store.createDocument('function', 'myFunctionName');
      expect(store.agentDocumentResolver.resolve(id)).toBe(store.getScheme(id));
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private), "Opening a document the agent touches" amendment — `agentSession`'s
// `onOpenDocument` handler.
describe('DesktopProjectStore — ensureAgentDocumentOpen', () => {
  it('opens and activates a document with no open tab yet', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const otherId = store.createDocument('function', 'otherFunction');
      store.closeTab(otherId);
      expect(store.openTabIds).not.toContain(otherId);

      store.ensureAgentDocumentOpen(otherId);

      expect(store.openTabIds).toContain(otherId);
      expect(store.activeTabId).toBe(otherId);
    } finally {
      store.dispose();
    }
  });

  it('leaves an already-open, inactive tab exactly as it was (never steals the active tab)', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      const firstId = store.createDocument('function', 'firstFunction');
      const secondId = store.createDocument('function', 'secondFunction');
      store.openTab(firstId);
      expect(store.activeTabId).toBe(firstId);
      expect(store.openTabIds).toContain(secondId);

      store.ensureAgentDocumentOpen(secondId);

      expect(store.activeTabId).toBe(firstId);
      expect(store.openTabIds).toContain(secondId);
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — getActiveHistory', () => {
  it('returns null when no tab is open', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      expect(store.getActiveHistory()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('returns a HistoryStore for every document type (e.g. "objects-structure")', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      store.createDocument('objects-structure', 'MyStructures');
      expect(store.getActiveHistory()).not.toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('returns a HistoryStore for the active "function" document, independent of getAgentHome', () => {
    setUpEmptyProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      store.createDocument('function', 'myFunctionName');
      expect(store.getActiveHistory()).not.toBeNull();
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — autosave after a scheme edit', () => {
  const setUpFunctionProject = (): {
    write: ReturnType<typeof vi.fn>;
    emitProjectChanged: (event: { kind: string }) => void;
  } => {
    const rootNode: INode = {
      id: 'fn-root',
      name: 'function',
      children: [
        { id: 'fn-header', name: 'function-header', data: '' },
        { id: 'fn-body', name: 'function-body', children: [], data: { parameters: [] } },
        { id: 'fn-footer', name: 'function-footer', data: '' },
      ],
    };
    const document: IProjectDocument = { id: 'fn', name: 'Main', root: rootNode, type: 'function' };
    const write = vi.fn().mockResolvedValue(null);
    const tree: IProjectTree = {
      documents: [{ id: 'fn', folderId: null, name: 'Main', type: 'function' }],
      folders: [],
    };
    const onChanged = vi.fn().mockReturnValue(vi.fn());
    (globalThis as { falang?: unknown }).falang = {
      codeExport: { onProgress: vi.fn().mockReturnValue(vi.fn()) },
      document: { read: vi.fn().mockResolvedValue(document), write },
      locks: { read: vi.fn().mockResolvedValue([]) },
      logicExport: { onProgress: vi.fn().mockReturnValue(vi.fn()), readConfig: vi.fn().mockResolvedValue(null) },
      project: {
        listTree: vi.fn().mockResolvedValue(tree),
        onChanged,
      },
    };
    return { emitProjectChanged: (event) => onChanged.mock.calls[0]?.[0](event), write };
  };

  const insertAction = (store: DesktopProjectStore): void => {
    store.getScheme('fn').commands.dispatchCommand(CMD_INSERT_NODE, {
      index: 0,
      node: { id: 'new-action', name: 'action', data: 'x = 1' },
      parentId: 'fn-body',
    });
  };

  it('writes the edited tree through document.write after the debounce', async () => {
    const { write } = setUpFunctionProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      insertAction(store);
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 3000 });
      expect(JSON.stringify(write.mock.calls[0]?.[1])).toContain('new-action');
    } finally {
      store.dispose();
    }
  });

  it('still writes the edit when the watcher refreshed the project tree after the scheme was built', async () => {
    // Every watcher `manifest` event (e.g. right after "New Project…" created the default document) re-reads the tree;
    // it used to replace the document objects, leaving a live scheme syncing into an orphan while autosave read the copy.
    const { write, emitProjectChanged } = setUpFunctionProject();
    const store = new DesktopProjectStore('/fake/project', 'logic');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      store.getScheme('fn');
      const before = store.getDocument('fn');
      emitProjectChanged({ kind: 'manifest' });
      await vi.waitFor(() => expect(globalThis.falang.project.listTree).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(store.getDocument('fn')).toBe(before);
      insertAction(store);
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 3000 });
      expect(JSON.stringify(write.mock.calls[0]?.[1])).toContain('new-action');
    } finally {
      store.dispose();
    }
  });
});

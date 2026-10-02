// oxlint-disable max-lines -- one file per store; the drivers part lives in arduino-project-store-drivers.test.ts
// @vitest-environment jsdom
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { INode } from '@falang/dto';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { CMD_INSERT_NODE } from '@falang/scheme';
import { DEVICES_DOCUMENT_TYPE } from '../../shared/devices-document.js';
import { ArduinoProjectStore } from './arduino-project-store.js';

/** `ArduinoProjectStore` re-reads the project's driver set on construction (ADR 0054 (private)); no drivers is a valid, empty answer. */
const driversMock = (): unknown => ({
  list: vi.fn().mockResolvedValue({ drivers: [], loadErrors: [] }),
  adoptReferenced: vi.fn().mockResolvedValue({ adopted: [], missing: [] }),
  onChanged: vi.fn().mockReturnValue(vi.fn()),
});

/** A brand-new project with no documents at all — `main`'s `ensureArduinoProjectDocuments` normally
 *  seeds `setup`/`loop`/`Devices` before this store is ever constructed (see
 *  `main/ensure-project-documents.ts`), but this store's own job is just to carry whatever's on disk
 *  through the tree/save/reload paths, so an empty tree is a perfectly valid (if unrealistic) fixture
 *  for exercising `toggleRightPanel`/`getAgentActiveDocumentId`/`getActiveHistory` in isolation. */
const setUpEmptyProject = (): void => {
  const tree: IProjectTree = { documents: [], folders: [] };
  (globalThis as { falang?: unknown }).falang = {
    drivers: driversMock(),
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
    arduino: {
      getProjectConfig: vi.fn().mockResolvedValue(null),
    },
    // `ArduinoProjectStore`'s constructor always builds one project-level `DebugSessionStore`
    // (`createArduinoDebugSession`), which subscribes to this IPC pair regardless of whether any test
    // here cares about debugging.
    debug: {
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      readBreakpoints: vi.fn().mockResolvedValue([]),
      writeBreakpoints: vi.fn().mockImplementation(() => Promise.resolve()),
    },
  };
};

describe('ArduinoProjectStore — toggleRightPanel', () => {
  it('starts closed', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      expect(store.rightPanel).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('opens the given panel, then closes it on a second toggle of the same panel', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
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
    const store = new ArduinoProjectStore('/fake/project');
    try {
      store.toggleRightPanel('history');
      store.toggleRightPanel('agent');
      expect(store.rightPanel).toBe('agent');
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private) §5, "no home document" amendment — the agent's active document is any open
// scheme document's id, never the `devices` document (which has no `Scheme` at all).
describe('ArduinoProjectStore — getAgentActiveDocumentId / getActiveHistory', () => {
  it('both return null when no tab is open', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      expect(store.getAgentActiveDocumentId()).toBeNull();
      expect(store.getActiveHistory()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('both return null for the active "devices" document (no Scheme)', async () => {
    const devicesDocId = 'devices-doc';
    const tree: IProjectTree = {
      documents: [{ id: devicesDocId, folderId: null, name: 'Devices', type: DEVICES_DOCUMENT_TYPE }],
      folders: [],
    };
    (globalThis as { falang?: unknown }).falang = {
      drivers: driversMock(),
      document: {
        create: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(null),
        read: vi.fn().mockResolvedValue({ id: devicesDocId, name: 'Devices', type: DEVICES_DOCUMENT_TYPE, data: {} }),
      },
      locks: { read: vi.fn().mockResolvedValue([]) },
      project: {
        listTree: vi.fn().mockResolvedValue(tree),
        onChanged: vi.fn().mockReturnValue(vi.fn()),
      },
      arduino: { getProjectConfig: vi.fn().mockResolvedValue(null) },
      debug: {
        onEvent: vi.fn().mockReturnValue(vi.fn()),
        readBreakpoints: vi.fn().mockResolvedValue([]),
        writeBreakpoints: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    };
    const store = new ArduinoProjectStore('/fake/project');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      store.openTab(devicesDocId);
      expect(store.getAgentActiveDocumentId()).toBeNull();
      expect(store.getActiveHistory()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('return the active document\'s id and a HistoryStore for the active "function" document', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      const id = store.createDocument('myFunctionName');
      expect(id).not.toBeNull();
      expect(store.getAgentActiveDocumentId()).toBe(id);
      expect(store.getActiveHistory()).not.toBeNull();
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private) §5 — `agentSession`'s `documentResolver`, over the project's own documents.
describe('ArduinoProjectStore — agentDocumentResolver', () => {
  it('throws for an unknown document id', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      expect(() => store.agentDocumentResolver.resolve('does-not-exist')).toThrow();
    } finally {
      store.dispose();
    }
  });

  it('throws for the "devices" document (no Scheme)', async () => {
    const devicesDocId = 'devices-doc';
    const tree: IProjectTree = {
      documents: [{ id: devicesDocId, folderId: null, name: 'Devices', type: DEVICES_DOCUMENT_TYPE }],
      folders: [],
    };
    (globalThis as { falang?: unknown }).falang = {
      drivers: driversMock(),
      document: {
        create: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(null),
        read: vi.fn().mockResolvedValue({ id: devicesDocId, name: 'Devices', type: DEVICES_DOCUMENT_TYPE, data: {} }),
      },
      locks: { read: vi.fn().mockResolvedValue([]) },
      project: {
        listTree: vi.fn().mockResolvedValue(tree),
        onChanged: vi.fn().mockReturnValue(vi.fn()),
      },
      arduino: { getProjectConfig: vi.fn().mockResolvedValue(null) },
      debug: {
        onEvent: vi.fn().mockReturnValue(vi.fn()),
        readBreakpoints: vi.fn().mockResolvedValue([]),
        writeBreakpoints: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    };
    const store = new ArduinoProjectStore('/fake/project');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      expect(() => store.agentDocumentResolver.resolve(devicesDocId)).toThrow();
    } finally {
      store.dispose();
    }
  });

  it('resolves a "function" document to its Scheme', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      const id = store.createDocument('myFunctionName') as string;
      expect(store.agentDocumentResolver.resolve(id)).toBe(store.getScheme(id));
    } finally {
      store.dispose();
    }
  });
});

// ADR 0036 (private), "Opening a document the agent touches" amendment — `agentSession`'s
// `onOpenDocument` handler.
describe('ArduinoProjectStore — ensureAgentDocumentOpen', () => {
  it('opens and activates a document with no open tab yet', () => {
    setUpEmptyProject();
    const store = new ArduinoProjectStore('/fake/project');
    try {
      const otherId = store.createDocument('otherFunction') as string;
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
    const store = new ArduinoProjectStore('/fake/project');
    try {
      const firstId = store.createDocument('firstFunction') as string;
      const secondId = store.createDocument('secondFunction') as string;
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

describe('ArduinoProjectStore — autosave after a scheme edit', () => {
  it('writes the edit even when the watcher refreshed the project tree after the scheme was built', async () => {
    const rootNode: INode = {
      id: 'fn-root',
      name: 'function',
      children: [
        { id: 'fn-header', name: 'function-header', data: '' },
        { id: 'fn-body', name: 'function-body', children: [], data: { parameters: [] } },
        { id: 'fn-footer', name: 'function-footer', data: '' },
      ],
    };
    const tree: IProjectTree = {
      documents: [{ id: 'fn', folderId: null, name: 'setup', type: 'function' }],
      folders: [],
    };
    const write = vi.fn().mockResolvedValue(null);
    const onChanged = vi.fn().mockReturnValue(vi.fn());
    (globalThis as { falang?: unknown }).falang = {
      drivers: driversMock(),
      arduino: { getProjectConfig: vi.fn().mockResolvedValue(null) },
      debug: {
        onEvent: vi.fn().mockReturnValue(vi.fn()),
        readBreakpoints: vi.fn().mockResolvedValue([]),
        writeBreakpoints: vi.fn().mockImplementation(() => Promise.resolve()),
      },
      document: {
        read: vi.fn().mockResolvedValue({ id: 'fn', name: 'setup', root: rootNode, type: 'function' }),
        write,
      },
      locks: { read: vi.fn().mockResolvedValue([]) },
      project: {
        listTree: vi.fn().mockResolvedValue(tree),
        onChanged,
      },
    };
    const store = new ArduinoProjectStore('/fake/project');
    try {
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      const scheme = store.getScheme('fn');
      const before = store.getDocument('fn');
      onChanged.mock.calls[0]?.[0]({ kind: 'manifest' });
      await vi.waitFor(() => expect(globalThis.falang.project.listTree).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(store.getDocument('fn')).toBe(before);
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'new-action', name: 'action', data: 'x = 1' },
        parentId: 'fn-body',
      });
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 3000 });
      expect(JSON.stringify(write.mock.calls[0]?.[1])).toContain('new-action');
    } finally {
      store.dispose();
    }
  });
});

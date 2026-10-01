// @vitest-environment jsdom
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { DEVICES_DOCUMENT_TYPE } from '../../shared/devices-document.js';
import { ArduinoProjectStore } from './arduino-project-store.js';

/** A brand-new project with no documents at all — `main`'s `ensureArduinoProjectDocuments` normally
 *  seeds `setup`/`loop`/`Devices` before this store is ever constructed (see
 *  `main/ensure-project-documents.ts`), but this store's own job is just to carry whatever's on disk
 *  through the tree/save/reload paths, so an empty tree is a perfectly valid (if unrealistic) fixture
 *  for exercising `toggleRightPanel`/`getAgentActiveDocumentId`/`getActiveHistory` in isolation. */
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

// @vitest-environment jsdom
import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INode } from '@falang/dto';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { CMD_INSERT_NODE } from '@falang/scheme';
import { ScriptedLlmClient } from '@falang/agent';
import type { IDriverConfig } from '../../shared/driver-config.js';
import type { IDriverListEntry, IDriverListPayload, TDriverScope } from '../../shared/driver-ipc-types.js';
import { ArduinoProjectStore } from './arduino-project-store.js';
import { driversFingerprint, driversRegistry } from './drivers-registry-store.js';

const demoConfig = (overrides: Partial<IDriverConfig> = {}): IDriverConfig => ({
  id: 'demo-led',
  label: 'Demo LED',
  includes: [],
  sourceFiles: ['demo.cpp'],
  declarations: ['declare function demoOn(pin: number): void'],
  actions: [
    {
      id: 'on',
      label: 'On',
      fields: [{ name: 'pin', label: 'Pin', kind: 'pin', default: '13' }],
      codeTemplate: 'demoOn(${pin})',
    },
  ],
  ...overrides,
});

const entry = (config: IDriverConfig, scope: TDriverScope = 'project'): IDriverListEntry => ({
  config,
  scope,
  status: 'ok',
});

const payload = (...entries: IDriverListEntry[]): IDriverListPayload => ({ drivers: entries, loadErrors: [] });

const rootNode: INode = {
  id: 'fn-root',
  name: 'function',
  children: [
    { id: 'fn-header', name: 'function-header', data: '' },
    { id: 'fn-body', name: 'function-body', children: [], data: { parameters: [] } },
    { id: 'fn-footer', name: 'function-footer', data: '' },
  ],
};

/** A project with one `function` document `fn`; `list` answers with whatever `listResult.current` holds. */
const setUpProject = (initial: IDriverListPayload) => {
  const listResult = { current: initial };
  const tree: IProjectTree = {
    documents: [{ id: 'fn', folderId: null, name: 'setup', type: 'function' }],
    folders: [],
  };
  const adoptReferenced = vi.fn().mockResolvedValue({ adopted: [], missing: [] });
  const write = vi.fn().mockResolvedValue(null);
  (globalThis as { falang?: unknown }).falang = {
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
    drivers: { list: vi.fn().mockImplementation(() => Promise.resolve(listResult.current)), adoptReferenced },
    locks: { read: vi.fn().mockResolvedValue([]) },
    project: { listTree: vi.fn().mockResolvedValue(tree), onChanged: vi.fn().mockReturnValue(vi.fn()) },
  };
  return { listResult, adoptReferenced, write };
};

const openProject = async (initial: IDriverListPayload) => {
  const mocks = setUpProject(initial);
  const store = new ArduinoProjectStore('/fake/project');
  await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
  store.openTab('fn');
  return { store, ...mocks };
};

const call = (id: string, name: string, input: unknown) => ({ text: '', toolCalls: [{ id, input, name }] });

/** Lets fire-and-forget work (and a not-happening rebuild) play out. */
const settle = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 30);
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('driversFingerprint', () => {
  it('ignores scope, status and ordering — only ids and configs count', () => {
    const a = entry(demoConfig(), 'library');
    const b = entry(demoConfig(), 'project');
    expect(driversFingerprint([a])).toBe(driversFingerprint([b]));
    const other = entry(demoConfig({ id: 'other', label: 'Other' }));
    expect(driversFingerprint([a, other])).toBe(driversFingerprint([other, a]));
  });

  it('changes when a config changes', () => {
    const before = driversFingerprint([entry(demoConfig())]);
    expect(driversFingerprint([entry(demoConfig({ label: 'Renamed' }))])).not.toBe(before);
  });
});

describe('driversRegistry.handleChangedEvent', () => {
  it('notifies only when the configs changed, not when just the scope did (adoption)', () => {
    driversRegistry.apply(payload(entry(demoConfig(), 'library')));
    const listener = vi.fn();
    const stop = driversRegistry.onConfigsChanged(listener);
    try {
      driversRegistry.handleChangedEvent(payload(entry(demoConfig(), 'project')));
      expect(listener).not.toHaveBeenCalled();
      expect(driversRegistry.scopeOf('demo-led')).toBe('project');
      driversRegistry.handleChangedEvent(payload(entry(demoConfig({ label: 'Changed' }), 'project')));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
});

describe('ArduinoProjectStore — drivers', () => {
  it('loads the project driver set before building any scheme', async () => {
    const { store } = await openProject(payload(entry(demoConfig())));
    try {
      expect(driversRegistry.scopeOf('demo-led')).toBe('project');
      const scheme = store.getScheme('fn');
      expect(() => scheme.infra.structure.getConfig('driver-action::demo-led::on')).not.toThrow();
    } finally {
      store.dispose();
    }
  });

  it("rebuildOpenSchemes flushes pending saves, drops the built schemes and bumps the open tabs' reload versions", async () => {
    const { store, write } = await openProject(payload(entry(demoConfig())));
    try {
      const first = store.getScheme('fn');
      const version = store.getReloadVersion('fn');
      first.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'a1', name: 'action', data: 'x = 1' },
        parentId: 'fn-body',
      });
      await store.rebuildOpenSchemes();
      expect(write).toHaveBeenCalled();
      expect(store.getReloadVersion('fn')).toBe(version + 1);
      const second = store.getScheme('fn');
      expect(second).not.toBe(first);
      expect(JSON.stringify(store.getDocument('fn')?.root)).toContain('a1');
    } finally {
      store.dispose();
    }
  });

  it('refreshDrivers re-reads the list and rebuilds when the set changed, not otherwise', async () => {
    const { store, listResult } = await openProject(payload(entry(demoConfig())));
    try {
      const version = store.getReloadVersion('fn');
      await store.refreshDrivers();
      expect(store.getReloadVersion('fn')).toBe(version);

      listResult.current = payload(entry(demoConfig()), entry(demoConfig({ id: 'second', label: 'Second' })));
      await store.refreshDrivers();
      expect(store.getReloadVersion('fn')).toBe(version + 1);
      expect(() => store.getScheme('fn').infra.structure.getConfig('driver-action::second::on')).not.toThrow();
    } finally {
      store.dispose();
    }
  });

  it('defers the rebuild after a drivers:changed event until the agent run ends', async () => {
    const { store } = await openProject(payload(entry(demoConfig())));
    try {
      const version = store.getReloadVersion('fn');
      (store.agentSession as { status: string }).status = 'running';
      driversRegistry.handleChangedEvent(payload(entry(demoConfig({ label: 'Changed while running' }))));
      await settle();
      expect(store.getReloadVersion('fn')).toBe(version);

      (store.agentSession as { status: string }).status = 'done';
      await vi.waitFor(() => expect(store.getReloadVersion('fn')).toBe(version + 1));
    } finally {
      store.dispose();
    }
  });

  it('does not rebuild when a library driver was only adopted (same config, new scope)', async () => {
    const { store } = await openProject(payload(entry(demoConfig(), 'library')));
    try {
      const version = store.getReloadVersion('fn');
      driversRegistry.handleChangedEvent(payload(entry(demoConfig(), 'project')));
      await settle();
      expect(store.getReloadVersion('fn')).toBe(version);
    } finally {
      store.dispose();
    }
  });

  it('adopts after a library driver action node is inserted, but not for a project driver or a plain node', async () => {
    const { store, adoptReferenced } = await openProject(payload(entry(demoConfig(), 'library')));
    try {
      const scheme = store.getScheme('fn');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'plain', name: 'action', data: 'x = 1' },
        parentId: 'fn-body',
      });
      await settle();
      expect(adoptReferenced).not.toHaveBeenCalled();

      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 1,
        node: scheme.infra.structure.factory('driver-action::demo-led::on'),
        parentId: 'fn-body',
      });
      await vi.waitFor(() => expect(adoptReferenced).toHaveBeenCalledTimes(1));
    } finally {
      store.dispose();
    }
  });

  it('does not adopt for a project-scope driver', async () => {
    const { store, adoptReferenced } = await openProject(payload(entry(demoConfig(), 'project')));
    try {
      const scheme = store.getScheme('fn');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: scheme.infra.structure.factory('driver-action::demo-led::on'),
        parentId: 'fn-body',
      });
      await settle();
      expect(adoptReferenced).not.toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });

  it('adopts after a library driver device is added to the Devices document', async () => {
    const { store, adoptReferenced } = await openProject(payload(entry(demoConfig(), 'library')));
    try {
      store.setDevicesDocumentData('fn', {
        pins: [],
        devices: [{ id: 'd1', driverId: 'demo-led', name: 'Demo', params: {} }],
      });
      await vi.waitFor(() => expect(adoptReferenced).toHaveBeenCalledTimes(1));
    } finally {
      store.dispose();
    }
  });

  it("the agent's set_driver awaits save + refresh, rebuilds once mid-run, and its later insert lands on the rebuilt scheme", async () => {
    const { store, listResult } = await openProject(payload(entry(demoConfig())));
    try {
      const version = store.getReloadVersion('fn');
      const next = payload(entry(demoConfig()), entry(demoConfig({ id: 'second', label: 'Second' })));
      const drivers = (globalThis as unknown as { falang: { drivers: Record<string, unknown> } }).falang.drivers;
      drivers.validate = vi.fn().mockResolvedValue({ errors: [], ok: true, warnings: [] });
      drivers.save = vi.fn(() => {
        listResult.current = next;
        driversRegistry.handleChangedEvent(next);
        return Promise.resolve({ errors: [], ok: true, warnings: [] });
      });
      const firstScheme = store.getScheme('fn');
      (store.agentSession as unknown as { client: unknown }).client = new ScriptedLlmClient([
        call('t1', 'insert_nodes', {
          documentId: 'fn',
          index: 0,
          node: { data: 'a = 1', name: 'action' },
          parentId: 'fn-body',
        }),
        call('t2', 'set_driver', { bundle: { anything: true } }),
        call('t3', 'insert_nodes', {
          documentId: 'fn',
          index: 1,
          node: { name: 'driver-action::second::on' },
          parentId: 'fn-body',
        }),
        call('t4', 'finish', { message: 'done' }),
      ]);
      await store.agentSession.run('add a driver', { activeDocumentId: 'fn' });
      expect(store.agentSession.status).toBe('done');
      expect(drivers.save).toHaveBeenCalledTimes(1);
      const steps = store.agentSession.steps.map((step) => step.result);
      expect(steps).toHaveLength(4);
      expect(steps.every((result) => result?.ok)).toBe(true);
      await settle();
      expect(store.getReloadVersion('fn')).toBe(version + 1);
      const rebuilt = store.getScheme('fn');
      expect(rebuilt).not.toBe(firstScheme);
      expect(JSON.stringify(store.getDocument('fn')?.root)).toContain('driver-action::second::on');
    } finally {
      store.dispose();
    }
  });
});

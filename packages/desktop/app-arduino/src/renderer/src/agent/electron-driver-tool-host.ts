import type { IDriverToolHost } from '@falang/desktop-agent-host';
import type {
  IDriverBundle,
  IDriverListEntry,
  IDriverValidationResult,
  TDriverScope,
} from '../../../shared/driver-ipc-types.js';

/** The slice of `falang.drivers` (preload) the agent's driver tools use. */
export interface IDriverToolIpc {
  list(): Promise<{ readonly drivers: readonly IDriverListEntry[] }>;
  get(id: string, scope: TDriverScope): Promise<IDriverBundle>;
  validate(bundle: unknown, scope: 'project'): Promise<IDriverValidationResult>;
  save(bundle: unknown, scope: 'project'): Promise<IDriverValidationResult>;
}

export interface IElectronDriverToolHostDeps {
  readonly ipc: IDriverToolIpc;
  /** The store's `refreshDrivers()` — reloads the registry and rebuilds the open schemes (immediately, even mid-run). */
  readonly refreshDrivers: () => Promise<void>;
}

/**
 * `IDriverToolHost` (ADR 0054 (private) §6) over the `falang.drivers.*` IPC. `setProjectDriver` awaits the store's
 * reload + scheme rebuild after a successful write, so the agent's next `get_node_kinds` sees the new node kinds.
 */
export const createElectronDriverToolHost = (deps: IElectronDriverToolHostDeps): IDriverToolHost => ({
  getDriver: async (id) => {
    const { drivers } = await deps.ipc.list();
    const entry = drivers.find((driver) => driver.config.id === id);
    if (!entry) throw new Error(`No driver "${id}" in this project`);
    return deps.ipc.get(id, entry.scope);
  },
  listDrivers: async () => {
    const { drivers } = await deps.ipc.list();
    return drivers;
  },
  setProjectDriver: async (bundle) => {
    const result = await deps.ipc.save(bundle, 'project');
    if (result.ok) await deps.refreshDrivers();
    return result;
  },
  validateDriver: (bundle) => deps.ipc.validate(bundle, 'project'),
});

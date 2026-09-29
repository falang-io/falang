import type { IDriverActionDescriptor, IDriverConfig } from '../../../shared/driver-config.js';
import { buildDriverActionNodeName } from '../../../shared/driver-node-name.js';

export interface IResolvedDriverAction {
  readonly driver: IDriverConfig;
  readonly action: IDriverActionDescriptor;
}

/** Resolves a `driver-action::{driverId}::{actionId}` node name back to its `IDriverConfig`/`IDriverActionDescriptor` pair — the same "resolve the node's own descriptor from a DI-registered registry" shape `@falang/workflow-scheme`'s `IntegrationsRegistryStore` uses for `telegram-send-message` and friends, see `driver-action-block.config.tsx`. */
export class DriverRegistryStore {
  private readonly byNodeName = new Map<string, IResolvedDriverAction>();

  constructor(drivers: readonly IDriverConfig[]) {
    for (const driver of drivers) {
      for (const action of driver.actions) {
        this.byNodeName.set(buildDriverActionNodeName(driver.id, action.id), { driver, action });
      }
    }
  }

  findAction(nodeName: string): IResolvedDriverAction | undefined {
    return this.byNodeName.get(nodeName);
  }
}

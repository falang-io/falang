import type { IDriverActionDescriptor, IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { localizeDriverConfig } from '@falang/desktop-arduino-dto/src/driver-localize.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';

export interface IResolvedDriverAction {
  readonly driver: IDriverConfig;
  readonly action: IDriverActionDescriptor;
}

/** Resolves a `driver-action::{driverId}::{actionId}` node name back to its `IDriverConfig`/`IDriverActionDescriptor` pair — the same "resolve the node's own descriptor from a DI-registered registry" shape `@falang/workflow-scheme`'s `IntegrationsRegistryStore` uses for `telegram-send-message` and friends, see `driver-action-block.config.tsx`. */
export class DriverRegistryStore {
  private readonly byNodeName = new Map<string, IResolvedDriverAction>();
  private readonly drivers: readonly IDriverConfig[];

  constructor(drivers: readonly IDriverConfig[]) {
    this.drivers = drivers;
    for (const driver of drivers) {
      for (const action of driver.actions) {
        this.byNodeName.set(buildDriverActionNodeName(driver.id, action.id), { driver, action });
      }
    }
  }

  private readonly localizedByLanguage = new Map<string, DriverRegistryStore>();

  /** The same registry with every label translated for `language` (untranslated text keeps English); cached per language. */
  localized(language: string): DriverRegistryStore {
    let store = this.localizedByLanguage.get(language);
    if (!store) {
      store = new DriverRegistryStore(this.drivers.map((driver) => localizeDriverConfig(driver, language)));
      this.localizedByLanguage.set(language, store);
    }
    return store;
  }

  findAction(nodeName: string): IResolvedDriverAction | undefined {
    return this.byNodeName.get(nodeName);
  }
}

import type { IModule, Scheme } from '@falang/scheme';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { DriverRegistryStore } from './driver-registry.store.js';
import { TOKEN_DRIVER_REGISTRY } from './driver-registry-token.js';

/** Registers `TOKEN_DRIVER_REGISTRY` into every scheme this app opens — mirrors `@falang/workflow-scheme`'s `IntegrationsModule`. */
export class DriverRegistryModule implements IModule {
  private readonly drivers: readonly IDriverConfig[];

  constructor(drivers: readonly IDriverConfig[]) {
    this.drivers = drivers;
  }

  register(scheme: Scheme): void {
    scheme.container.register(TOKEN_DRIVER_REGISTRY, { useValue: new DriverRegistryStore(this.drivers) });
  }
}

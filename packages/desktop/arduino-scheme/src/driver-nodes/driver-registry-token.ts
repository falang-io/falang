import { createSchemeToken } from '@falang/di';
import type { DriverRegistryStore } from './driver-registry.store.js';

export const TOKEN_DRIVER_REGISTRY = createSchemeToken<DriverRegistryStore>('DRIVER_REGISTRY');

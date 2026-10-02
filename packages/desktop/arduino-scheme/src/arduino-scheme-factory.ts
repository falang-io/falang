import type { DependencyContainer } from '@falang/di';
import type { IModule } from '@falang/scheme';
import { functionalSchemeFactory } from '@falang/typescript-scheme';
import { PIN_NODE_NAMES } from '@falang/desktop-arduino-dto/src/pin-nodes.js';
import { ARDUINO_FUNCTION_NODE_NAMES } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
import { pinNodesIconsGroup } from './pin-nodes/pin-nodes-icons-group.js';
import { arduinoFunctionsIconsGroup } from './arduino-functions/arduino-functions-icons-group.js';
import { DriverRegistryModule } from './driver-nodes/driver-registry.module.js';
import {
  getDriverConfigs,
  getDriverInsertableItems,
  getDriverNodesIconsGroup,
} from './driver-nodes/driver-registry-cache.js';

/**
 * Every scheme this app opens gets the pin node kinds (ADR 0023 (private)'s Phase A), the
 * pin-less Arduino built-in-function node kinds (`delay`/`millis`/`random`/`Serial.*`, …, see
 * `arduino-functions/arduino-functions-icons-group.ts`), and every loaded driver's action node kinds
 * (Phase B/C) on top of `@falang/typescript-scheme`'s base `function` node set — via the `extraIconsGroups`/`extraInsertableItems` seams `functionalSchemeFactory` already
 * exposes for exactly this (`@falang/workflow-scheme` uses the same mechanism for its own per-vendor
 * nodes), so neither `@falang/typescript-scheme` nor `@falang/scheme` need to know Arduino pins or
 * drivers exist. `extraModules` passes through, with `DriverRegistryModule` prepended — a caller (e.g.
 * `ArduinoProjectStore.buildScheme`, which adds ADR 0021 (private)'s `DebuggerModule`) doesn't have
 * to choose between pin/driver nodes and any other scheme module. Driver configs must already be loaded
 * (`initializeDriverRegistry`, called once from `main.tsx` before the app's first render) — see
 * `driver-registry-cache.ts`'s doc comment for what happens if that hasn't happened yet.
 */
export const arduinoSchemeFactory = (params: {
  id: string;
  name: string;
  parentContainer: DependencyContainer;
  extraModules?: IModule[];
  /** Version diff view (ADR 0025 (private)) — see `versioning/build-read-only-scheme-for-diff.ts`. */
  readOnly?: boolean;
}) =>
  functionalSchemeFactory({
    ...params,
    extraIconsGroups: [pinNodesIconsGroup, arduinoFunctionsIconsGroup, getDriverNodesIconsGroup()],
    extraInsertableItems: [...PIN_NODE_NAMES, ...ARDUINO_FUNCTION_NODE_NAMES, ...getDriverInsertableItems()],
    extraModules: [new DriverRegistryModule(getDriverConfigs()), ...(params.extraModules ?? [])],
  });

import type { IconsGroup } from '@falang/scheme';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { buildDriverNodesIconsGroup } from './driver-nodes-icons-group.js';

/**
 * Driver configs are fetched once via IPC before the app's first render (see `main.tsx`) and cached
 * here — `arduinoSchemeFactory` is called on demand, once per document/scheme opened (see
 * `arduino-project-store.ts`), so building the `IconsGroup`/insertable-name list once up front (rather
 * than on every scheme open, the way a naive re-derivation would) avoids rebuilding an identical
 * `NodesGroup` repeatedly. Starts empty (`[]`/an empty `IconsGroup`) so a scheme built before
 * `initializeDriverRegistry` resolves (or in a test harness that never calls it) still works — just
 * with no driver-action node kinds available, the same graceful-degradation posture
 * `registerTypescriptProjectService`'s optional resolution elsewhere in this app already uses.
 */
let cachedDrivers: readonly IDriverConfig[] = [];
let cachedIconsGroup: IconsGroup = buildDriverNodesIconsGroup([]);
let cachedInsertableNames: readonly string[] = [];

export const initializeDriverRegistry = (drivers: readonly IDriverConfig[]): void => {
  cachedDrivers = drivers;
  cachedIconsGroup = buildDriverNodesIconsGroup(drivers);
  cachedInsertableNames = drivers.flatMap((driver) =>
    driver.actions.map((action) => buildDriverActionNodeName(driver.id, action.id)),
  );
};

export const getDriverConfigs = (): readonly IDriverConfig[] => cachedDrivers;

export const getDriverNodesIconsGroup = (): IconsGroup => cachedIconsGroup;

export const getDriverInsertableNames = (): readonly string[] => cachedInsertableNames;

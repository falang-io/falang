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
export type TDriverScopeHint = 'bundled' | 'library' | 'project';

let cachedDrivers: readonly IDriverConfig[] = [];
let cachedScopes: Readonly<Record<string, TDriverScopeHint>> = {};
let cachedIconsGroup: IconsGroup = buildDriverNodesIconsGroup([]);
let cachedInsertableNames: readonly string[] = [];
let cachedInsertableItems: readonly { name: string; label: string }[] = [];

/**
 * `scopes` (optional, driver id → scope) only decorates labels: a `library` driver is not part of the project
 * until a node/device using it is added (ADR 0054 (private) §3), so the palette and the Devices "Add device" menu
 * mark it with a "(library)" suffix. The configs themselves are what node kinds are built from.
 */
export const initializeDriverRegistry = (
  drivers: readonly IDriverConfig[],
  scopes: Readonly<Record<string, TDriverScopeHint>> = {},
): void => {
  cachedDrivers = drivers;
  cachedScopes = scopes;
  cachedIconsGroup = buildDriverNodesIconsGroup(drivers, scopes);
  cachedInsertableNames = drivers.flatMap((driver) =>
    driver.actions.map((action) => buildDriverActionNodeName(driver.id, action.id)),
  );
  cachedInsertableItems = drivers.flatMap((driver) =>
    driver.actions.map((action) => ({
      name: buildDriverActionNodeName(driver.id, action.id),
      label: `${driver.label}${scopes[driver.id] === 'library' ? ' (library)' : ''} \u2014 ${action.label}`,
    })),
  );
};

export const getDriverScope = (driverId: string): TDriverScopeHint | undefined => cachedScopes[driverId];

/** The "(library)" decoration of a driver's display label — empty for bundled/project drivers. */
export const getDriverScopeSuffix = (driverId: string): string =>
  cachedScopes[driverId] === 'library' ? ' (library)' : '';

/** Palette entries (node name + readable label, "(library)"-marked for library drivers) for `functionalSchemeFactory`'s `extraInsertableItems`. */
export const getDriverInsertableItems = (): readonly { name: string; label: string }[] => cachedInsertableItems;

export const getDriverConfigs = (): readonly IDriverConfig[] => cachedDrivers;

export const getDriverNodesIconsGroup = (): IconsGroup => cachedIconsGroup;

export const getDriverInsertableNames = (): readonly string[] => cachedInsertableNames;

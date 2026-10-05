import type { IconsGroup } from '@falang/scheme';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { localizeDriverConfig } from '@falang/desktop-arduino-dto/src/driver-localize.js';
import { getGlobalI18n } from '@falang/scheme';
import { buildDriverNodesIconsGroup, DRIVER_TITLES_NS } from './driver-nodes-icons-group.js';

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

/**
 * `scopes` (optional, driver id → scope) only decorates labels: a `library` driver is not part of the project
 * until a node/device using it is added (ADR 0054 (private) §3), so the palette and the Devices "Add device" menu
 * mark it with a "(library)" suffix. The configs themselves are what node kinds are built from.
 */
/** "(library)" in the user's language — a library driver is not part of the project until something uses it. */
const libraryWord = (language: string): string => (language.startsWith('ru') ? 'библиотека' : 'library');

let titleBundleCounter = 0;
const nextTitleBundleId = (): string => {
  titleBundleCounter += 1;
  return `${DRIVER_TITLES_NS}-${String(titleBundleCounter)}`;
};

/**
 * Registers the per-language "Driver: Action" block titles (`arduino-drivers:<driverId>.<actionId>`, see `driverTitleKey`) on
 * the shared i18n store: English always, plus every other language any driver ships a `locales` entry for. A language with
 * no bundle falls back to English. Each call uses a fresh module id because `I18NStore` loads a module once per language —
 * re-registering the same id after a driver change would be ignored.
 */
const registerDriverTitleLocales = (
  drivers: readonly IDriverConfig[],
  scopes: Readonly<Record<string, TDriverScopeHint>>,
): void => {
  const languages = new Set(['en', ...drivers.flatMap((driver) => Object.keys(driver.locales ?? {}))]);
  const loaders: Record<string, () => Promise<{ default: Record<string, Record<string, unknown>> }>> = {};
  for (const language of languages) {
    loaders[language] = () => {
      const titles: Record<string, string> = {};
      for (const driver of drivers) {
        const localized = localizeDriverConfig(driver, language);
        const suffix = scopes[driver.id] === 'library' ? ` (${libraryWord(language)})` : '';
        for (const action of localized.actions)
          titles[`${driver.id}.${action.id}`] = `${localized.label}${suffix}: ${action.label}`;
      }
      // i18next nests dotted keys, so build `{ [driverId]: { [actionId]: title } }`.
      const nested: Record<string, Record<string, string>> = {};
      for (const [key, title] of Object.entries(titles)) {
        const [driverId = '', actionId = ''] = key.split('.');
        (nested[driverId] ??= {})[actionId] = title;
      }
      return Promise.resolve({ default: { [DRIVER_TITLES_NS]: nested } });
    };
  }
  getGlobalI18n()
    .register(nextTitleBundleId(), loaders)
    .catch(() => null);
};

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
  cachedIconsGroup = buildDriverNodesIconsGroup(drivers);
  cachedInsertableNames = drivers.flatMap((driver) =>
    driver.actions.map((action) => buildDriverActionNodeName(driver.id, action.id)),
  );
  registerDriverTitleLocales(drivers, scopes);
};

export const getDriverScope = (driverId: string): TDriverScopeHint | undefined => cachedScopes[driverId];

/** The "(library)" decoration of a driver's display label — empty for bundled/project drivers. */
export const getDriverScopeSuffix = (driverId: string, language: string = getGlobalI18n().language): string =>
  cachedScopes[driverId] === 'library' ? ` (${libraryWord(language)})` : '';

export interface IDriverInsertableOptions {
  /** UI language the labels are translated to. */
  readonly language?: string;
  /** When given, only actions of these drivers are listed (a driver is "connected" once the `Devices` document has an instance of it). */
  readonly connectedDriverIds?: ReadonlySet<string>;
}

/**
 * Palette entries (node name + readable label, "(library)"-marked for library drivers) of the driver actions — the
 * "Device" menu group. Only a palette/menu filter: every driver's node kinds stay registered, so existing nodes of a
 * since-removed device still validate and compile.
 */
export const getDriverInsertableItems = (options: IDriverInsertableOptions = {}): { name: string; label: string }[] => {
  const language = options.language ?? getGlobalI18n().language;
  return cachedDrivers
    .filter((driver) => !options.connectedDriverIds || options.connectedDriverIds.has(driver.id))
    .flatMap((driver) => {
      const localized = localizeDriverConfig(driver, language);
      const suffix = cachedScopes[driver.id] === 'library' ? ` (${libraryWord(language)})` : '';
      return localized.actions.map((action) => ({
        name: buildDriverActionNodeName(driver.id, action.id),
        label: `${localized.label}${suffix} \u2014 ${action.label}`,
      }));
    });
};

export const getDriverConfigs = (): readonly IDriverConfig[] => cachedDrivers;

export const getDriverNodesIconsGroup = (): IconsGroup => cachedIconsGroup;

export const getDriverInsertableNames = (): readonly string[] => cachedInsertableNames;

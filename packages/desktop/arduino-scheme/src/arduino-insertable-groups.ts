import type { IInsertableGroup } from '@falang/typescript-scheme';
import { getGlobalI18n } from '@falang/scheme';
import { PIN_NODE_NAMES } from '@falang/desktop-arduino-dto/src/pin-nodes.js';
import { ARDUINO_FUNCTION_NODE_NAMES } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
import { getDriverInsertableItems } from './driver-nodes/driver-registry-cache.js';
import { ARDUINO_SCHEME_NS, nodeTitle } from './locales/arduino-t.js';

export interface IArduinoInsertableGroupsOptions {
  /**
   * Driver ids that have at least one instance in the project's `Devices` document. `undefined` = no filtering (a host
   * without a project, e.g. headless tests); an empty set hides the "Device" group.
   */
  readonly getConnectedDriverIds?: () => ReadonlySet<string> | undefined;
}

/**
 * The valence-point menu groups this IDE adds: "Arduino" (pins and the built-in functions) and "Device" (driver actions of
 * connected devices only). Returned from a getter the scheme calls on every menu build, so labels follow the UI language
 * and the "Device" group follows the `Devices` document while the scheme stays open.
 */
export const buildArduinoInsertableGroups =
  (options: IArduinoInsertableGroupsOptions = {}) =>
  (): IInsertableGroup[] => {
    const i18n = getGlobalI18n();
    const language = i18n.language;
    const connectedDriverIds = options.getConnectedDriverIds?.();
    return [
      {
        label: i18n.t(`${ARDUINO_SCHEME_NS}:group.arduino`),
        items: [...PIN_NODE_NAMES, ...ARDUINO_FUNCTION_NODE_NAMES].map((name) => ({ name, label: nodeTitle(name) })),
      },
      {
        label: i18n.t(`${ARDUINO_SCHEME_NS}:group.device`),
        items: getDriverInsertableItems({ language, connectedDriverIds }),
      },
    ];
  };

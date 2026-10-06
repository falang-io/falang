import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup, type INodeConfig } from '@falang/dto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { buildDriverNodeConfigs } from './driver-node-configs.js';
import { driverActionBlockConfig } from './driver-action-block.config.js';

/** i18n namespace holding one `<driverId>.<actionId>` → "Driver: Action" title per bundle `registerDriverTitleLocales` registers. */
export const DRIVER_TITLES_NS = 'arduino-drivers';

export const driverTitleKey = (driverId: string, actionId: string): string =>
  `${DRIVER_TITLES_NS}:${driverId}.${actionId}`;

/** Same shape as `pin-nodes-icons-group.ts`/`@falang/workflow-scheme`'s `integration-nodes-icons-group.ts` — one icon label per (driver, action) node name, all sharing `driverActionBlockConfig`. */
export const buildDriverNodesIconsGroup = (drivers: readonly IDriverConfig[]): IconsGroup => {
  const nodeConfigs: readonly INodeConfig[] = buildDriverNodeConfigs(drivers);
  const entries = drivers.flatMap((driver) =>
    driver.actions.map(
      (action) =>
        [
          buildDriverActionNodeName(driver.id, action.id),
          // A key, not text: `block-view.tsx` resolves the title with `t`, so it follows the UI language
          // (`registerDriverTitleLocales` supplies the per-language strings).
          getSimpleIconNodeConfig(driverActionBlockConfig, driverTitleKey(driver.id, action.id)),
        ] as const,
    ),
  );
  return new IconsGroup(new NodesGroup(nodeConfigs), Object.fromEntries(entries));
};

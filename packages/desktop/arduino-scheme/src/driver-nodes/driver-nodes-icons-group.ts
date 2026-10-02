import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup, type INodeConfig } from '@falang/dto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { buildDriverNodeConfigs } from './driver-node-configs.js';
import { driverActionBlockConfig } from './driver-action-block.config.js';

/** Same shape as `pin-nodes-icons-group.ts`/`@falang/workflow-scheme`'s `integration-nodes-icons-group.ts` — one icon label per (driver, action) node name, all sharing `driverActionBlockConfig`. */
export const buildDriverNodesIconsGroup = (
  drivers: readonly IDriverConfig[],
  scopes: Readonly<Record<string, string>> = {},
): IconsGroup => {
  const nodeConfigs: readonly INodeConfig[] = buildDriverNodeConfigs(drivers);
  const entries = drivers.flatMap((driver) =>
    driver.actions.map(
      (action) =>
        [
          buildDriverActionNodeName(driver.id, action.id),
          getSimpleIconNodeConfig(
            driverActionBlockConfig,
            `${driver.label}${scopes[driver.id] === 'library' ? ' (library)' : ''}: ${action.label}`,
          ),
        ] as const,
    ),
  );
  return new IconsGroup(new NodesGroup(nodeConfigs), Object.fromEntries(entries));
};

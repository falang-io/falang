import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup, type INodeConfig } from '@falang/dto';
import type { IDriverConfig } from '../../../shared/driver-config.js';
import { buildDriverActionNodeName } from '../../../shared/driver-node-name.js';
import { buildDriverNodeConfigs } from './driver-node-configs.js';
import { driverActionBlockConfig } from './driver-action-block.config.js';

/** Same shape as `pin-nodes-icons-group.ts`/`@falang/workflow-scheme`'s `integration-nodes-icons-group.ts` — one icon label per (driver, action) node name, all sharing `driverActionBlockConfig`. */
export const buildDriverNodesIconsGroup = (drivers: readonly IDriverConfig[]): IconsGroup => {
  const nodeConfigs: readonly INodeConfig[] = buildDriverNodeConfigs(drivers);
  const entries = drivers.flatMap((driver) =>
    driver.actions.map(
      (action) =>
        [
          buildDriverActionNodeName(driver.id, action.id),
          getSimpleIconNodeConfig(driverActionBlockConfig, `${driver.label}: ${action.label}`),
        ] as const,
    ),
  );
  return new IconsGroup(new NodesGroup(nodeConfigs), Object.fromEntries(entries));
};

import { getPseudoBlockConfig } from '../../blocks/pseudo-block/pseudo-block.config.js';
import { CELL_SIZE_4 } from '../../constants.js';
import { emptyShape } from '../../shapes/empty-shape.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { PseudoCycleIconComponent } from './pseudo-cycle.icon.cmp.js';
import { PseudoCycleIconStore } from './pseudo-cycle.icon.store.js';

export const getPseudoCycleIconNodeConfig = (name: string) => {
  const foreachIconConfig = {
    factory: (params) => new PseudoCycleIconStore(params),
    view: PseudoCycleIconComponent,
  } as const satisfies IIconConfig;

  const nodeConfig = {
    shape: emptyShape,
    block: getPseudoBlockConfig(`icon:${name}`, CELL_SIZE_4),
    icon: foreachIconConfig,
  } as const satisfies IIconNodeConfig<unknown, PseudoCycleIconStore>;

  return nodeConfig;
};

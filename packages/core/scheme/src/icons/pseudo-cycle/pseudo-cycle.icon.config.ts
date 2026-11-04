import { getPseudoBlockConfig } from '../../blocks/pseudo-block/pseudo-block.config.js';
import { CELL_SIZE } from '../../constants.js';
import { emptyShape } from '../../shapes/empty-shape.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { PseudoCycleIconComponent } from './pseudo-cycle.icon.cmp.js';
import { PseudoCycleIconStore } from './pseudo-cycle.icon.store.js';

/** Wide enough for the longest label ("Псевдоцикл", "Pseudo-cycle"). */
const PSEUDO_CYCLE_BLOCK_WIDTH = CELL_SIZE * 6;

export const getPseudoCycleIconNodeConfig = (name: string) => {
  const foreachIconConfig = {
    factory: (params) => new PseudoCycleIconStore(params),
    view: PseudoCycleIconComponent,
  } as const satisfies IIconConfig;

  const nodeConfig = {
    shape: emptyShape,
    block: getPseudoBlockConfig(`icon:${name}`, PSEUDO_CYCLE_BLOCK_WIDTH),
    icon: foreachIconConfig,
  } as const satisfies IIconNodeConfig<unknown, PseudoCycleIconStore>;

  return nodeConfig;
};

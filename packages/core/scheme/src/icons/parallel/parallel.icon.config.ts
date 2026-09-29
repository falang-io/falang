import { getPseudoBlockConfig } from '../../blocks/pseudo-block/pseudo-block.config.js';
import { CELL_SIZE_4 } from '../../constants.js';
import { emptyShape } from '../../shapes/empty-shape.js';
import { IconWithSkewerCommonStore } from '../../skewer/icon-with-skewer-common.store.js';
import { IconWithSkewerComponent } from '../../skewer/icon-with-skewer.cmp.js';
import type { IconWithSkewerStore } from '../../skewer/icon-with-skewer.store.js';
import { IconWithThreadsCommonStore } from '../../threads/icon-with-threads-common.store.js';
import type { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import type { IIconNodeConfig } from '../../types/icon-config.js';
import { ParallelIconComponent } from './parallel.icon.cmp.js';

export const getParallelIconConfig = <TName extends string = string>(name: TName) => {
  const baseIconNodeConfig = {
    shape: emptyShape,
    block: getPseudoBlockConfig(`icon:${name}`, CELL_SIZE_4),
    icon: {
      view: ParallelIconComponent,
      factory: (params) => new IconWithThreadsCommonStore(params),
    },
  } as const satisfies IIconNodeConfig<unknown, IconWithThreadsStore>;

  const childIconNodeConfig = {
    shape: emptyShape,
    block: getPseudoBlockConfig(`icon:${name}-thread`, CELL_SIZE_4),
    icon: {
      view: IconWithSkewerComponent,
      factory: (params) => new IconWithSkewerCommonStore(params),
    },
  } as const satisfies IIconNodeConfig<unknown, IconWithSkewerStore>;

  const returnValue = {
    [name as TName]: baseIconNodeConfig,
    [`${name}-thread`]: childIconNodeConfig,
  } as Record<TName, typeof baseIconNodeConfig> & Record<`${TName}-thread`, typeof childIconNodeConfig>;

  return returnValue;
};

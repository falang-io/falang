import { emptyShape } from '../../shapes/empty-shape.js';
import { rhombusShape } from '../../shapes/rhombus.js';
import { IconWithSkewerCommonStore } from '../../skewer/icon-with-skewer-common.store.js';
import { IconWithSkewerComponent } from '../../skewer/icon-with-skewer.cmp.js';
import type { IconWithSkewerStore } from '../../skewer/icon-with-skewer.store.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { emptyBlockConfig } from '../../utils/empty-block.js';
import { IfIconComponent } from './if.icon.cmp.js';
import { IfIconStore } from './if.icon.store.js';

export interface IGetIfIconConfigParams<TName extends string = string, TData = unknown> {
  name: TName;
  block: IBlockConfig<TData>;
}

export const getIfIconConfig = <TName extends string = string, TData = unknown>({
  name,
  block,
}: IGetIfIconConfigParams<TName, TData>) => {
  const baseIcon = {
    view: IfIconComponent,
    factory: (params) => new IfIconStore(params),
  } as const satisfies IIconConfig<IfIconStore>;

  const optionIcon = {
    view: IconWithSkewerComponent,
    factory: (params) => new IconWithSkewerCommonStore(params),
  } as const satisfies IIconConfig<IconWithSkewerStore>;

  const baseIconNodeConfig = {
    shape: rhombusShape,
    block,
    icon: baseIcon,
  } as const satisfies IIconNodeConfig<unknown, IfIconStore>;

  const childIconNodeConfig = {
    shape: emptyShape,
    block: emptyBlockConfig,
    icon: optionIcon,
  } as const satisfies IIconNodeConfig<unknown, IconWithSkewerStore>;

  const returnValue = {
    [name as TName]: baseIconNodeConfig,
    [`${name}-child`]: childIconNodeConfig,
  } as Record<TName, typeof baseIconNodeConfig> & Record<`${TName}-child`, typeof childIconNodeConfig>;
  return returnValue;
};

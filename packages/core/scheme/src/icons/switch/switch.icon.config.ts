import { optionShape } from '../../shapes/option.js';
import { parallelogramShape } from '../../shapes/parallelogram.js';
import { IconWithSkewerCommonStore } from '../../skewer/icon-with-skewer-common.store.js';
import { IconWithSkewerComponent } from '../../skewer/icon-with-skewer.cmp.js';
import type { IconWithSkewerStore } from '../../skewer/icon-with-skewer.store.js';
import type { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { SwitchIconComponent } from './switch.icon.cmp.js';
import { SwitchIconStore } from './switch.icon.store.js';

export interface IGetSwitchIconConfigParams<TName extends string = string, TData = unknown, TChildData = unknown> {
  name: TName;
  block: IBlockConfig<TData>;
  child: IBlockConfig<TChildData>;
  title?: string | true;
}

export const getSwitchIconConfig = <TName extends string = string, TData = unknown>({
  name,
  block,
  child,
  title,
}: IGetSwitchIconConfigParams<TName, TData>) => {
  const baseIcon = {
    view: SwitchIconComponent,
    factory: (params) => new SwitchIconStore(params),
  } as const satisfies IIconConfig<IconWithThreadsStore>;

  const optionIcon = {
    view: IconWithSkewerComponent,
    factory: (params) => new IconWithSkewerCommonStore(params),
  } as const satisfies IIconConfig<IconWithSkewerStore>;

  const baseIconNodeConfig = {
    shape: parallelogramShape,
    block,
    icon: baseIcon,
    title,
  } as const satisfies IIconNodeConfig<unknown, IconWithThreadsStore>;

  const childIconNodeConfig = {
    shape: optionShape,
    block: child,
    icon: optionIcon,
  } as const satisfies IIconNodeConfig<unknown, IconWithSkewerStore>;

  const returnValue = {
    [name as TName]: baseIconNodeConfig,
    [`${name}-option`]: childIconNodeConfig,
  } as Record<TName, typeof baseIconNodeConfig> & Record<`${TName}-option`, typeof childIconNodeConfig>;
  return returnValue;
};

import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { ForEachIconStore } from './foreach.icon.store.js';
import { ForeachIconComponent } from './foreach.icon.cmp.js';
import type { IBlockConfig } from '../../types/block-config.js';
import { cycleHeaderShape } from '../../shapes/cycle-head.js';

export interface IGetForeachIconConfigParams<TData = unknown> {
  block: IBlockConfig<TData>;
}

export const getForeachIconNodeConfig = <TData = unknown>({ block }: IGetForeachIconConfigParams<TData>) => {
  const foreachIconConfig = {
    factory: (params) => new ForEachIconStore(params),
    view: ForeachIconComponent,
  } as const satisfies IIconConfig;

  const nodeConfig = {
    shape: cycleHeaderShape,
    block,
    icon: foreachIconConfig,
  } as const satisfies IIconNodeConfig<TData, ForEachIconStore>;

  return nodeConfig;
};

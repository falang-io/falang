import { rhombusShape } from '../../shapes/rhombus.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { WhileIconComponent } from './while.icon.cmp.js';
import { WhileIconStore } from './while.icon.store.js';

export interface IGetWhileIconConfigParams<TData = unknown> {
  block: IBlockConfig<TData>;
}

export const getWhileIconNodeConfig = <TData = unknown>({ block }: IGetWhileIconConfigParams<TData>) => {
  const foreachIconConfig = {
    factory: (params) => new WhileIconStore(params),
    view: WhileIconComponent,
  } as const satisfies IIconConfig;

  const nodeConfig = {
    shape: rhombusShape,
    block,
    icon: foreachIconConfig,
  } as const satisfies IIconNodeConfig<TData, WhileIconStore>;

  return nodeConfig;
};

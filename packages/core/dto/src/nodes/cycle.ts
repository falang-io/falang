import type { INodeConfig, IDataInfo } from '../types.js';
import type { INodeBuilderOptions } from './action.js';

export const cycle = <TName extends string, TData extends IDataInfo>(
  name: TName,
  data: TData,
  options?: INodeBuilderOptions,
) =>
  ({
    name,
    data,
    ...(options?.mods ? { mods: options.mods } : {}),
    children: true,
    haveOut: true,
  }) as const satisfies INodeConfig;

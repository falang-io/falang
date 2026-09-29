import type { INodeConfig, IDataInfo } from '../types.js';

export const cycle = <TName extends string, TData extends IDataInfo>(name: TName, data: TData) =>
  ({
    name,
    data,
    children: true,
    haveOut: true,
  }) as const satisfies INodeConfig;

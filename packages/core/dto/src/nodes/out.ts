import type { z } from 'zod';
import type { IDataInfo, INodeConfig, IOutType } from '../types.js';

export const getOutConfigSimple = <TName extends string>(name: TName, type: IOutType) =>
  ({
    name,
    outType: type,
  }) as const satisfies INodeConfig;

export const getOutConfigWithData = <TName extends string, TData extends z.ZodType>(
  name: TName,
  type: IOutType,
  data: IDataInfo<TData>,
) =>
  ({
    name,
    outType: type,
    data,
  }) as const satisfies INodeConfig;

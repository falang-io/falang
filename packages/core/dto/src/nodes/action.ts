import type z from 'zod';
import type { INodeConfig, IDataInfo } from '../types.js';

export const action = <TName extends string, TData extends z.ZodType>(name: TName, data: IDataInfo<TData>) =>
  ({ name, data }) as const satisfies INodeConfig;

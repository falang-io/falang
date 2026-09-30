import type z from 'zod';
import type { INodeConfig, IDataInfo } from '../types.js';

export interface INodeBuilderOptions<TMods extends readonly string[] = readonly string[]> {
  /** Mod kinds the root node of this group accepts (see `INodeConfig.mods`). */
  readonly mods?: TMods;
}

export const action = <TName extends string, TData extends z.ZodType>(
  name: TName,
  data: IDataInfo<TData>,
  options?: INodeBuilderOptions,
) => ({ name, data, ...(options?.mods ? { mods: options.mods } : {}) }) as const satisfies INodeConfig;

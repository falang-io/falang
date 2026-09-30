import type z from 'zod';
import type { INodeConfig, IDataInfo } from '../types.js';
import { nanoid } from 'nanoid';
import type { INodeBuilderOptions } from './action.js';

export const ifCfg = <TName extends string, TData extends z.ZodType>(
  name: TName,
  data: IDataInfo<TData>,
  options?: INodeBuilderOptions,
) =>
  [
    {
      name,
      data,
      ...(options?.mods ? { mods: options.mods } : {}),
      childTuple: [`${name}-child` as `${TName}-child`, `${name}-child` as `${TName}-child`],
      factory: () => ({
        id: nanoid(),
        name,
        data: data.default(),
        children: [
          {
            id: nanoid(),
            name: `${name}-child`,
            children: [],
          },
          {
            id: nanoid(),
            name: `${name}-child`,
            children: [],
          },
        ],
      }),
    },
    {
      name: `${name}-child` as `${typeof name}-child`,
      children: true,
      haveOut: true,
    },
  ] as const satisfies readonly INodeConfig[];

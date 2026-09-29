import type z from 'zod';
import { nanoid } from 'nanoid';
import type { INodeConfig, IDataInfo } from '../types.js';

export const switchCfg = <TName extends string, TData extends z.ZodType, ToptionData extends z.ZodType>({
  name,
  data,
  optionData,
}: {
  name: TName;
  data: IDataInfo<TData>;
  optionData: IDataInfo<ToptionData>;
}) =>
  [
    {
      name,
      data,
      children: [`${name}-option` as `${typeof name}-option`],
      factory: () => ({
        id: nanoid(),
        name,
        data: data.default(),
        children: [
          {
            id: nanoid(),
            name: `${name}-option`,
            data: optionData.default(),
            children: [],
          },
          {
            id: nanoid(),
            name: `${name}-option`,
            data: optionData.default(),
            children: [],
          },
        ],
      }),
    },
    {
      name: `${name}-option` as `${TName}-option`,
      data: optionData,
      children: true,
      haveOut: true,
    },
  ] as const satisfies readonly INodeConfig[];

import { nanoid } from 'nanoid';
import type { INodeConfig } from '../types.js';

export const parallelCfg = <TName extends string>(name: TName) =>
  [
    {
      name,
      children: [`${name}-thread` as `${typeof name}-thread`],
      factory: () => ({
        id: nanoid(),
        name,
        children: [
          {
            id: nanoid(),
            name: `${name}-thread`,
            children: [],
          },
          {
            id: nanoid(),
            name: `${name}-thread`,
            children: [],
          },
        ],
      }),
    },
    {
      name: `${name}-thread` as `${TName}-thread`,
      children: true,
      haveOut: true,
    },
  ] as const satisfies readonly INodeConfig[];

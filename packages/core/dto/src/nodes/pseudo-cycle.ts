import type { INodeConfig } from '../types.js';

export const pseudoCycleCfg = <TName extends string>(name: TName) =>
  ({
    name,
    children: true,
    haveOut: true,
  }) as const satisfies INodeConfig;

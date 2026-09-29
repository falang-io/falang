import type { INodeConfig, zod } from '@falang/dto';
import type { IIconNodeConfig, IIconNodeFinalConfig } from './icon-config.js';

export type TIconsConfig<TConfig extends readonly INodeConfig[] = readonly INodeConfig[]> = {
  [K in TConfig[number] as K['name']]: IIconNodeConfig<zod.infer<K['data']>>;
};

export type TIconsFinalConfig<TConfig extends readonly INodeConfig[] = readonly INodeConfig[]> = {
  [K in TConfig[number] as K['name']]: IIconNodeFinalConfig<zod.infer<K['data']>>;
};

import { emptyShape } from '../../shapes/empty-shape.js';
import { rectangleRoundedShape } from '../../shapes/rectangle-rounded.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { simpleIconConfig } from '../simple/simple.icon.config.js';
import { FunctionBodyIconComponent } from './function-body.icon.cmp.js';
import { FunctionBodyIconStore } from './function-body.icon.store.js';
import { FunctionIconComponent } from './function.icon.cmp.js';
import { FunctionIconStore } from './function.icon.store.js';

export interface IGetFunctionIconConfigParams<
  TName extends string = string,
  THeaderData = unknown,
  TBodyData = unknown,
  TFooterData = unknown,
> {
  name: TName;
  header: IBlockConfig<THeaderData>;
  body: IBlockConfig<TBodyData>;
  footer: IBlockConfig<TFooterData>;
}

export const getFunctionIconConfig = <
  TName extends string = string,
  THeaderData = unknown,
  TBodyData = unknown,
  TFooterData = unknown,
>({
  name,
  header,
  body,
  footer,
}: IGetFunctionIconConfigParams<TName, THeaderData, TBodyData, TFooterData>) => {
  const functionIcon = {
    view: FunctionIconComponent,
    factory: (params) => new FunctionIconStore(params),
  } as const satisfies IIconConfig<FunctionIconStore>;
  const functionIconConfig = {
    shape: emptyShape,
    block: { view: () => null },
    icon: functionIcon,
  } as const satisfies IIconNodeConfig<unknown, FunctionIconStore>;
  const functionHeaderIconConfig = {
    shape: rectangleRoundedShape,
    block: header,
    icon: simpleIconConfig,
  } as const satisfies IIconNodeConfig;
  const functionBodyIconConfig = {
    shape: rectangleRoundedShape,
    block: body,
    icon: {
      view: FunctionBodyIconComponent,
      factory: (params) => new FunctionBodyIconStore(params),
    },
  } as const satisfies IIconNodeConfig<unknown, FunctionBodyIconStore>;
  const functionFooterIconConfig = {
    shape: rectangleRoundedShape,
    block: footer,
    icon: simpleIconConfig,
  } as const satisfies IIconNodeConfig;
  const returnValue = {
    [name]: functionIconConfig,
    [`${name}-header` as `${TName}-header`]: functionHeaderIconConfig,
    [`${name}-body` as `${TName}-body`]: functionBodyIconConfig,
    [`${name}-footer` as `${TName}-footer`]: functionFooterIconConfig,
  } as Record<TName, typeof functionIconConfig> &
    Record<`${TName}-header`, typeof functionBodyIconConfig> &
    Record<`${TName}-body`, typeof functionBodyIconConfig> &
    Record<`${TName}-footer`, typeof functionFooterIconConfig>;

  return returnValue;
};

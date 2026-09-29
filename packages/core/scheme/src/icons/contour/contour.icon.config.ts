import { emptyShape } from '../../shapes/empty-shape.js';
import { optionRevesedShape } from '../../shapes/option-reversed.js';
import { optionShape } from '../../shapes/option.js';
import { rectangleRoundedShape } from '../../shapes/rectangle-rounded.js';
import { IconWithSkewerCommonStore } from '../../skewer/icon-with-skewer-common.store.js';
import { IconWithSkewerComponent } from '../../skewer/icon-with-skewer.cmp.js';
import { IconWithThreadsComponent } from '../../threads/icon-with-threads.cmp.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IIconNodeConfig } from '../../types/icon-config.js';
import { emptyBlockConfig } from '../../utils/empty-block.js';
import { FunctionBodyIconComponent } from '../function/function-body.icon.cmp.js';
import { FunctionBodyIconStore } from '../function/function-body.icon.store.js';
import { simpleIconConfig } from '../simple/simple.icon.config.js';
import type { SimpleIconStore } from '../simple/simple.icon.js';
import { ContourBodyStore } from './contour-body.store.js';
import { ContourFunctionFooterIconStore } from './contour-function-footer.icon.store.js';
import { ContourFunctionIconComponent } from './contour-function.icon.cmp.js';
import { ContourFunctionIconStore } from './contour-function.icon.store.js';
import { ContourIconComponent } from './contour.icon.cmp.js';
import { ContourIconStore } from './contour.icon.store.js';

export interface IGetContourIconNodeConfigParams<
  TName extends string = string,
  TData = unknown,
  THeader = unknown,
  TFunction = unknown,
  TFunctionReturn = unknown,
  TFinish = unknown,
  TFinishFooter = unknown,
> {
  name: TName;
  data: IBlockConfig<TData>;
  header: IBlockConfig<THeader>;
  functionData: IBlockConfig<TFunction>;
  functionReturn: IBlockConfig<TFunctionReturn>;
  finishData: IBlockConfig<TFinish>;
  finishFooterData: IBlockConfig<TFinishFooter>;
}

export const getContourIconNodeConfig = <
  TName extends string = string,
  TData = unknown,
  THeader = unknown,
  TFunction = unknown,
  TFunctionReturn = unknown,
  TFinish = unknown,
  TFinishFooter = unknown,
>({
  name,
  data,
  header,
  functionData,
  functionReturn,
  finishData,
  finishFooterData,
}: IGetContourIconNodeConfigParams<TName, TData, THeader, TFunction, TFunctionReturn, TFinish, TFinishFooter>) => {
  const iconConfig = {
    block: emptyBlockConfig,
    icon: {
      view: ContourIconComponent,
      factory: (params) => new ContourIconStore(params),
    },
    shape: emptyShape,
  } as const satisfies IIconNodeConfig<unknown, SimpleIconStore>;

  const headerConfig = {
    block: header,
    icon: simpleIconConfig,
    shape: rectangleRoundedShape,
  } as const satisfies IIconNodeConfig<unknown, SimpleIconStore>;

  const bodyConfig = {
    block: data,
    icon: {
      view: IconWithThreadsComponent,
      factory: (params) => new ContourBodyStore(params),
    },
    shape: rectangleRoundedShape,
  } as const satisfies IIconNodeConfig<unknown, ContourBodyStore>;

  const functionConfig = {
    shape: optionShape,
    block: functionData,
    icon: {
      view: ContourFunctionIconComponent,
      factory: (params) => new ContourFunctionIconStore(params),
    },
  } as const satisfies IIconNodeConfig<unknown, SimpleIconStore>;

  const functionBodyIconConfig = {
    block: emptyBlockConfig,
    shape: emptyShape,
    icon: {
      view: FunctionBodyIconComponent,
      factory: (params) => new FunctionBodyIconStore(params),
    },
  } as const satisfies IIconNodeConfig<unknown, FunctionBodyIconStore>;

  const functionFooter = {
    block: emptyBlockConfig,
    icon: {
      view: IconWithThreadsComponent,
      factory: (params) => new ContourFunctionFooterIconStore(params),
    },
    shape: emptyShape,
  } as const satisfies IIconNodeConfig<unknown, ContourFunctionFooterIconStore>;

  const returnConfig = {
    block: functionReturn,
    icon: simpleIconConfig,
    shape: optionRevesedShape,
  } as const satisfies IIconNodeConfig<unknown, SimpleIconStore>;

  const finishFooterConfig = {
    block: finishFooterData,
    icon: simpleIconConfig,
    shape: rectangleRoundedShape,
  } as const satisfies IIconNodeConfig<unknown, SimpleIconStore>;

  const finishConfig = {
    block: finishData,
    icon: {
      view: IconWithSkewerComponent,
      factory: (params) => new IconWithSkewerCommonStore(params),
    },
    shape: optionShape,
  } as const satisfies IIconNodeConfig<unknown, IconWithSkewerCommonStore>;

  return {
    [name]: iconConfig,
    [`${name}-header`]: headerConfig,
    [`${name}-body`]: bodyConfig,
    [`${name}-function`]: functionConfig,
    [`${name}-function-body`]: functionBodyIconConfig,
    [`${name}-function-footer`]: functionFooter,
    [`${name}-function-return`]: returnConfig,
    [`${name}-finish`]: finishConfig,
    [`${name}-finish-footer`]: finishFooterConfig,
  } as Record<TName, typeof iconConfig> &
    Record<`${TName}-header`, typeof headerConfig> &
    Record<`${TName}-body`, typeof bodyConfig> &
    Record<`${TName}-function`, typeof functionConfig> &
    Record<`${TName}-function-body`, typeof functionBodyIconConfig> &
    Record<`${TName}-function-footer`, typeof functionFooter> &
    Record<`${TName}-function-return`, typeof returnConfig> &
    Record<`${TName}-finish`, typeof finishConfig> &
    Record<`${TName}-finish-footer`, typeof finishFooterConfig>;
};

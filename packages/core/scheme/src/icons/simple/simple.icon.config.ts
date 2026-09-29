import type { IIconConfig, IIconNodeConfig } from '../../types/icon-config.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { SimpleIconStore } from './simple.icon.js';
import type { IconStore } from '../../store/icon.store.js';
import type { IBlockConfig } from '../../types/block-config.js';
import type { IBlockShapeConfig } from '../../types/block-shape.js';
import { rectangleShape } from '../../shapes/rectangle.js';

export const simpleIconConfig = {
  factory: (params) => new SimpleIconStore(params),
  view: BaseIconComponent,
} as const satisfies IIconConfig;

export const getSimpleIconNodeConfig = <TData = unknown>(
  block: IBlockConfig<TData>,
  title?: string | true,
  shape: IBlockShapeConfig = rectangleShape,
) => {
  const returnValue = {
    shape,
    block,
    icon: simpleIconConfig,
    title,
  } as const satisfies IIconNodeConfig<TData, IconStore>;
  return returnValue;
};

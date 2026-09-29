import type { IconStore } from '../store/icon.store.js';
import type { IBlockConfig } from './block-config.js';
import type { IBlockShapeConfig, IBlockShapeFinalConfig } from './block-shape.js';
import type { TIconFactory } from './icon-factory.js';

export type IIconView<TIcon extends IconStore = IconStore> = React.FC<{ icon: TIcon }>;

export interface IIconConfig<TIcon extends IconStore = IconStore> {
  factory: TIconFactory<TIcon>;
  view(props: { icon: TIcon }): ReturnType<IIconView<TIcon>>;
}

export interface IIconNodeConfig<TData = unknown, TIcon extends IconStore = IconStore> {
  icon: IIconConfig<TIcon>;
  shape: IBlockShapeConfig;
  block: IBlockConfig<TData>;
  /**
   * If true, title of icon will be 'icon:{name}'
   */
  title?: string | true;
  // title?: string | true | ((icon: TIcon) => string);
}

export interface IIconNodeFinalConfig<TData = unknown, TIcon extends IconStore = IconStore> extends IIconNodeConfig<
  TData,
  TIcon
> {
  shape: IBlockShapeFinalConfig;
}

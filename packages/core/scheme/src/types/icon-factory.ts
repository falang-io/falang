import type { IconStore, IIconStoreParams } from '../store/icon.store.js';
export type TIconFactory<TIcon extends IconStore> = (params: IIconStoreParams) => TIcon;

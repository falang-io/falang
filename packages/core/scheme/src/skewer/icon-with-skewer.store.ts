import { IconStore, type IIconStoreParams } from '../store/icon.store.js';
import { addFlag, IconFlags } from '../types/icon-flags.js';
import type { IIconWithList } from '../types/icon-list.js';
import type { ISkewerBaseParams } from './skewer.store.js';
import { SkewerStore } from './skewer.store.js';
import type { IIconStoreWithChildren } from '../checker.js';

export interface IIconWithSkewerStoreParams extends IIconStoreParams {
  skewer?: ISkewerBaseParams;
}

export abstract class IconWithSkewerStore extends IconStore implements IIconWithList, IIconStoreWithChildren {
  readonly skewer: SkewerStore;

  constructor(params: IIconWithSkewerStoreParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.Skewer, IconFlags.WithChildren, IconFlags.List),
    });
    this.skewer = new SkewerStore({
      parent: this,
      ...params.skewer,
    });
  }

  get list() {
    return this.skewer;
  }

  dispose() {
    super.dispose();
    this.skewer.dispose();
  }

  get children(): readonly IconStore[] {
    return this.list.icons;
  }
}

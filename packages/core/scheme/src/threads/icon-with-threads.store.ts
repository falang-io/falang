import { makeObservable } from 'mobx';
import type { IIconStoreParams } from '../store/icon.store.js';
import { IconStore } from '../store/icon.store.js';
import type { IIconWithList } from '../types/icon-list.js';
import type { IThreadsStoreParams } from './threads.store.js';
import { ThreadsStore } from './threads.store.js';
import { addFlag, IconFlags } from '../types/icon-flags.js';
import type { IIconStoreWithChildren } from '../checker.js';

export interface IIconWithThreadsParams extends IIconStoreParams {
  threads?: IThreadsStoreParams;
}

export abstract class IconWithThreadsStore extends IconStore implements IIconWithList, IIconStoreWithChildren {
  readonly threads: ThreadsStore;
  constructor(params: IIconWithThreadsParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.Threads, IconFlags.WithChildren, IconFlags.List),
    });
    this.threads = new ThreadsStore(params.threads);
    this.threads.parent = this;
    makeObservable(this);
  }

  get children() {
    return this.threads.icons;
  }

  get list(): ThreadsStore {
    return this.threads;
  }

  dispose(): void {
    this.threads.dispose();
    super.dispose();
  }
}

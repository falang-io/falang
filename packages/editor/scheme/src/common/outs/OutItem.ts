import { computed, makeObservable } from 'mobx';
import { checker } from '../../checker';
import { ThreadsIconStore } from '../threads/ThreadsIconStore';
import { CycleIconStore } from '../../icons/cycle/Cycle.icon.store';
import { FunctionIconStore } from '../../icons/function/Function.icon.store';
import { SchemeStore } from '../../store/Scheme.store';

export type TOutType = 'break' | 'return' | 'continue';

export interface IOutItemParams {
  type: TOutType,
  id: string,
  outLevel?: number
}

export interface IOutBaseItem {
  id: string
}

export interface IOutThreadsItem extends IOutBaseItem {
  type: 'threads'
  index: number
}

export interface IOutSkewerItem extends IOutBaseItem {
  type: 'skewer'
  index: number
}

export interface IOutCycleItem extends IOutBaseItem {
  type: 'cycle'
}

export interface IOutFunctionItem extends IOutBaseItem {
  type: 'function'
}

export type TOutParentItem = IOutSkewerItem | IOutCycleItem | IOutThreadsItem | IOutFunctionItem;
export type TOutParentsArray = TOutParentItem[];

export class OutItem {
  readonly outLevel: number;
  readonly id: string;
  readonly type: TOutType;
  readonly scheme: SchemeStore

  constructor(params: IOutItemParams, scheme: SchemeStore) {
    this.outLevel = params.outLevel ?? 1;
    this.id = params.id;
    this.type = params.type;
    this.scheme = scheme;
    makeObservable(this);
  }

  get targetCycle(): CycleIconStore | null {
    const id = this.targetCycleId;
    if (!id) return null;
    return this.scheme.icons.get(id) as CycleIconStore;
  }

  @computed get targetCycleId(): string | null {
    if (this.type === 'return') return null;
    const parentItems = this.parentItems;
    if (!parentItems.length) return null;
    const lastItem = parentItems[parentItems.length - 1];
    if(lastItem.type !== 'cycle') return null;
    return lastItem.id;
  }

  get targetFunction(): FunctionIconStore | null {
    const id = this.targetCycleId;
    if (!id) return null;
    return this.scheme.icons.get(id) as FunctionIconStore;
  }

  @computed get targetId(): string | null {
    if(this.type === 'return') return this.targetFunctionId;
    return this.targetCycleId;
  }

  @computed get targetFunctionId(): string | null {
    if (this.type !== 'return') return null;
    const parentItems = this.parentItems;
    if (!parentItems.length) return null;
    const lastItem = parentItems[parentItems.length - 1];
    if(lastItem.type !== 'function') return null;
    return lastItem.id;
  }

  @computed get lastThreadId(): string | null {
    const parentItems = this.parentItems;
    let setItem: IOutThreadsItem | undefined;
    parentItems.forEach((parentItem) => {
      if(parentItem.type === 'threads') {
        setItem = parentItem;
      }
    });
    if(!setItem) return null;
    return setItem.id;
  }

  @computed.struct get parentItems(): TOutParentsArray {
    const parentsArray: TOutParentsArray = [];
    let node = this.scheme.icons.get(this.id);
    let parent = node?.parent;
    let breakLevel = this.outLevel;
    while (!!node) {
      if(checker.isThreads(parent)) {
        parentsArray.push({
          type: 'threads',
          id: parent?.id,
          index: parent.threads.getIconIndex(node.id)
        });
      }
      if(checker.isIconWithSkewer(parent)) {
        parentsArray.push({
          type: 'skewer',
          id: parent.id,
          index: parent.skewer.getIconIndex(node.id)
        });        
      }
      if(checker.isCycle(node)) {
        breakLevel--;
        parentsArray.push({
          type: 'cycle',
          id: node.id,
        });
        if (this.type !== 'return' && breakLevel === 0) {
          break;
        }
      }
      if(checker.isFunction(node) && this.type === 'return') {
        parentsArray.push({
          type: 'function',
          id: node.id,
        });
      } 
      if(!parent) break;
      node = parent;
      parent = node.parent;
    }
    return parentsArray;
  }

  @computed get parentThreadsId(): string | null {
    const parentItems = this.parentItems;
    const set = parentItems.find((item) => item.type === 'threads');
    if(!set) return null;
    return set.id;
  }

  get parentThreads(): ThreadsIconStore | null {
    const parentThreadsId = this.parentThreadsId;
    if(!parentThreadsId) return null;
    return this.scheme.icons.get(parentThreadsId) as ThreadsIconStore;
  }

  @computed get indexInParentThreads(): number | null {
    const parentItems = this.parentItems;
    const set = parentItems.find((item) => item.type === 'threads');
    if(!set || set.type !== 'threads') return null;
    return set.index;
  }

  @computed get nextSameId(): string | null {
    const index = this.indexInParentThreads
    const parentThreads = this.parentThreads;
    if(index === null || parentThreads === null) return null;
    if(checker.isThreads(parentThreads.parent)) {
      const nextThread = parentThreads.parent.threads.getAtIndex(index + 1);
      if(checker.isIconWithSkewer(nextThread)) {
        if(nextThread.skewer.outStore?.type === this.type) {
          return nextThread.id;
        }
      }
    }
    return null;
  }

  @computed get nextSameX(): number {
    const nextSameId = this.nextSameId;
    if(!nextSameId) return 0;
    return this.scheme.icons.get(nextSameId).position.x;
  }

  @computed get hasNextSame(): boolean {
    return !!this.nextSameId;
  }

  @computed get isLastOfType(): boolean {
    return !this.hasNextSame;
  }
}

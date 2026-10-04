import { action, computed, makeObservable, observable } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';

export interface IHistoryStoreItem {
  stackName?: string;
  startValue?: string | number;
  back: () => void;
  forward: () => void;
}

const MAX_HISTORY_SIZE = 50;

export class HistoryStore {
  private readonly history = observable<IHistoryStoreItem>([]);
  @observable private backLevel = 0;
  @observable private saveIndex = -1;
  @observable private groupDepth = 0;
  private groupItems: IHistoryStoreItem[] = [];
  private attachedScheme: Scheme | null = null;
  private replayDepth = 0;

  constructor() {
    makeObservable(this);
  }

  /**
   * Binds the store to the scheme whose tree the items act on. Items resolve the scheme at `back`/`forward` time
   * (`requireScheme`), so a store can be moved to a rebuilt scheme (same node ids) and keep its undo stack.
   */
  attach(scheme: Scheme): void {
    if (this.groupDepth > 0) throw new Error('HistoryStore.attach: cannot move the store while a group is open');
    if (this.replayDepth > 0) throw new Error('HistoryStore.attach: cannot move the store during a replay');
    this.attachedScheme = scheme;
  }

  /** Unbinds `scheme` if it is still the attached one (a no-op once the store moved on to another scheme). */
  detach(scheme: Scheme): void {
    if (this.attachedScheme === scheme) this.attachedScheme = null;
  }

  requireScheme(): Scheme {
    if (!this.attachedScheme) throw new Error('HistoryStore: no scheme attached');
    return this.attachedScheme;
  }

  /** True while a history item is being replayed — the handlers must not record its own mutations. */
  get isReplaying(): boolean {
    return this.replayDepth > 0;
  }

  replay<T>(fn: (scheme: Scheme) => T): T {
    const scheme = this.requireScheme();
    this.replayDepth += 1;
    try {
      return fn(scheme);
    } finally {
      this.replayDepth -= 1;
    }
  }

  @computed get isModified(): boolean {
    return this.history.length - this.backLevel - 1 !== this.saveIndex;
  }

  @computed get isGrouping(): boolean {
    return this.groupDepth > 0;
  }

  @action beginGroup(): void {
    this.groupDepth += 1;
  }

  @action endGroup(): void {
    if (this.groupDepth === 0) throw new Error('HistoryStore.endGroup: no open group');
    this.groupDepth -= 1;
    if (this.groupDepth > 0) return;
    const items = this.groupItems;
    this.groupItems = [];
    if (items.length === 0) return;
    this.pushItem(
      items.length === 1
        ? items[0]
        : {
            back: () => {
              for (let i = items.length - 1; i >= 0; i -= 1) items[i].back();
            },
            forward: () => {
              items.forEach((item) => item.forward());
            },
          },
    );
  }

  runGrouped<T>(fn: () => T): T {
    this.beginGroup();
    try {
      return fn();
    } finally {
      this.endGroup();
    }
  }

  async runGroupedAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.beginGroup();
    try {
      return await fn();
    } finally {
      this.endGroup();
    }
  }

  @action add(item: IHistoryStoreItem): void {
    if (this.groupDepth > 0) {
      this.groupItems.push(item);
      return;
    }
    this.pushItem(item);
  }

  @action private pushItem(item: IHistoryStoreItem): void {
    if (this.backLevel > 0) {
      this.history.splice(-this.backLevel);
      this.backLevel = 0;
    } else if (this.history.length > 0) {
      const lastItem = this.history.at(-1);
      if (!lastItem) throw new Error('Should be lastItem');
      if (lastItem.stackName && lastItem.stackName === item.stackName) {
        // @TODO тут неверно, startValue будет одинаковым
        if (lastItem.startValue && lastItem.startValue === item.startValue) {
          this.history.pop();
        } else {
          lastItem.forward = item.forward;
        }
        return;
      }
    }
    if (this.history.length >= MAX_HISTORY_SIZE) {
      this.history.shift();
      this.saveIndex -= 1;
    }
    this.history.push(item);
  }

  @action forward(): void {
    if (this.groupDepth > 0) throw new Error('HistoryStore: back/forward while a group is open');
    if (this.backLevel === 0) return;
    const newBackLevel = this.backLevel - 1;
    const historyItem = this.history[this.history.length - 1 - newBackLevel];
    historyItem.forward();
    this.backLevel = newBackLevel;
  }

  @action back(): void {
    if (this.groupDepth > 0) throw new Error('HistoryStore: back/forward while a group is open');
    const historyItem = this.history[this.history.length - 1 - this.backLevel];
    if (!historyItem) return;
    historyItem.back();
    const newBackLevel = this.backLevel + 1;
    this.backLevel = newBackLevel;
  }

  @action onSave(): void {
    this.saveIndex = this.history.length - 1 - this.backLevel;
  }

  @action clear(): void {
    this.history.clear();
    this.saveIndex = -1;
    this.groupItems = [];
    this.groupDepth = 0;
  }

  @computed get isBackAvailable(): boolean {
    return Boolean(this.history[this.history.length - 1 - this.backLevel]);
  }

  @computed get isForwardAvailable(): boolean {
    return this.backLevel > 0;
  }
}

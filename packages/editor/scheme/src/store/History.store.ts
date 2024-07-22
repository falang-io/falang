import { action, computed, makeObservable, observable } from 'mobx';

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

  constructor() {
    makeObservable(this);
  }

  @computed get isModified() {
    return this.history.length - this.backLevel - 1 !== this.saveIndex;
  }

  @action add(item: IHistoryStoreItem) {
    if (this.backLevel > 0) {
      this.history.splice(-this.backLevel);
      this.backLevel = 0;
    } else if(this.history.length > 0) {
      const lastItem = this.history[this.history.length - 1];      
      if(lastItem.stackName && lastItem.stackName === item.stackName) {
        // @TODO тут неверно, startValue будет одинаковым
        if(lastItem.startValue && lastItem.startValue === item.startValue) {
          this.history.pop();
        } else {
          lastItem.forward = item.forward;
        }       
        return;
      }
    }
    if(this.history.length >= MAX_HISTORY_SIZE) {
      this.history.shift();
      this.saveIndex--;
    }
    this.history.push(item);
  }

  @action forward() {
    if (this.backLevel === 0) return;
    const newBackLevel = this.backLevel - 1;
    const historyItem = this.history[this.history.length - 1 - newBackLevel];
    historyItem.forward();
    this.backLevel = newBackLevel;
  }

  @action back() {
    const historyItem = this.history[this.history.length - 1 - this.backLevel];
    if (!historyItem) return;
    historyItem.back();
    const newBackLevel = this.backLevel + 1;
    this.backLevel = newBackLevel;
  }

  @action onSave() {
    this.saveIndex = this.history.length - 1 -  this.backLevel;
  }

  @action clear() {
    this.history.clear();
    this.saveIndex = -1;
  }
}
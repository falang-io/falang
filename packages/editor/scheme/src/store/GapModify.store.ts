import { action, computed, makeObservable, observable, toJS } from "mobx";
import { CELL_SIZE } from '../common/constants';
import { ThreadsIconStore } from '../common/threads/ThreadsIconStore';
import { SchemeStore } from './Scheme.store';

const maxWidth = 100;

interface IGapModifyStateOnMouseDownParams {
  x: number
  y: number
  width: number
  threadsId: string
  index: number
}

export class GapModifyStore {
  @observable x = 0;
  @observable y = 0;
  @observable currentWidth = 0;
  private oldGaps: number[] = [];
  @observable threadsId: string | null = null;
  @observable index = 0;
  @observable private _enabled = false;

  constructor(private scheme: SchemeStore) {
    makeObservable(this);
  }

  @action onMouseDown(params: IGapModifyStateOnMouseDownParams, e: React.MouseEvent<SVGGElement, MouseEvent>) {
    this.x = params.x;
    this.y = params.y;
    this.currentWidth = params.width;
    this.threadsId = params.threadsId
    this.index = params.index;
    this.scheme.state = 'resize-gap';
    const threads = this.scheme.icons.get(this.threadsId) as ThreadsIconStore;
    this.oldGaps = threads.threads.gaps;
  }

  get isModifying(): boolean {
    return this.scheme.state === 'resize-gap';
  }

  get enabled(): boolean {
    return this._enabled;
  }

  @action setEnabled(enabled: boolean) {
    this._enabled = enabled;
  }

  @action onMouseMove(x: number) {
    const diff = x - this.x;
    let newWidth = 0;
    if (diff > 0) {
      newWidth = Math.round(diff / CELL_SIZE);
      if (newWidth > maxWidth) {
        newWidth = maxWidth;
      }
    }
    if (!this.threadsId) return;
    const threads = this.scheme.icons.get(this.threadsId) as ThreadsIconStore;
    const currentGaps = threads.list.gaps.slice();
    if (this.index > currentGaps.length - 1) {
      while (currentGaps.length < this.index + 1) {
        currentGaps.push(0);
      }
    }
    currentGaps[this.index] = newWidth;
    threads.list.gaps.replace(currentGaps);
  }

  @action stop() {
    if (!this.threadsId) return;
    const beforeGaps = toJS(this.oldGaps);
    const threads = this.scheme.icons.get(this.threadsId) as ThreadsIconStore;
    const iconId = toJS(this.threadsId);
    const afterGaps = toJS(threads.threads.gaps);
    if (this.isModifying && !isEqualGaps(beforeGaps, afterGaps)) {
      this.scheme.onChange({
        back: () => {
          const threads = this.scheme.icons.get(iconId) as ThreadsIconStore;
          threads.threads.gaps.replace(beforeGaps);
        },
        forward: () => {
          const threads = this.scheme.icons.get(iconId) as ThreadsIconStore;
          threads.threads.gaps.replace(afterGaps);
        },
      });
    }
    this.scheme.resetState();
    this.threadsId = null;
  }

  @computed get showGapControls(): boolean {
    return this.scheme.isEditing && !this.scheme.selection.isSomeSelected && this.enabled;
  }
}

const isEqualGaps = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
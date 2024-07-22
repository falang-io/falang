import { action, computed, makeObservable, observable } from 'mobx';
import { TNumberComputed } from '../types/TComputedProperty';
import { getComputedValue } from './getComputedValue';

const UNKNOWN_POS = -999999;

export class PositionStore {

  @observable.ref private cx: TNumberComputed = null;
  @observable.ref private cy: TNumberComputed = null;

  constructor() {
    makeObservable(this);
  }

  @computed get x(): number {
    return getComputedValue(this.cx, UNKNOWN_POS);
  }

  @computed get y(): number {
    return getComputedValue(this.cy, UNKNOWN_POS);
  }

  @computed get hasValue(): boolean {
    return this.cx !== null;
  }

  @action setPosition({x, y}: Record<'x' | 'y', TNumberComputed>) {
    this.cx = x;
    this.cy = y;
  }

  reset() {
    this.cx = null;
    this.cy = null;
  }

  dispose() {
    this.reset();
  }
}
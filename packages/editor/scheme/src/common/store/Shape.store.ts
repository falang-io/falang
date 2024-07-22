import { action, computed, makeObservable, observable } from 'mobx';
import { TComputedProperty, TNumberComputed } from '../types/TComputedProperty';
import { getComputedValue } from './getComputedValue';

export class ShapeStore {
  @observable.ref private cl: TNumberComputed = null;
  @observable.ref private cr: TNumberComputed = null;
  @observable.ref private ch: TNumberComputed = null;

  constructor() {
    makeObservable(this);
  }

  @computed get height(): number {
    return getComputedValue(this.ch, 0);
  }

  @computed get leftSize(): number {
    return getComputedValue(this.cl, 0);
  }

  @computed get rightSize(): number {
    return getComputedValue(this.cr, 0);
  }

  @action setSize({leftSize, rightSize, height}: Record<'leftSize' | 'rightSize' | 'height', TNumberComputed>) {
    this.ch = height;
    this.cl = leftSize;
    this.cr = rightSize;
  }

  @action setHeight(height: TNumberComputed) {
    this.ch = height;
  }

  @action setWidth(width: TNumberComputed) {
    this.cl = 0;
    this.cr = width;
  }

  reset() {
    this.cl = null;
    this.ch = null;
    this.cr = null;
  }

  dispose() {
    this.reset();
  }

  @computed get width() {
    return this.leftSize + this.rightSize;
  }

  get halfHeight() {
    return this.height > 0 ? Math.round(this.height / 2) : 0;
  }

  get halfWidth() {
    return this.leftSize;
  }

  cloneSize() {
    return {
      height: () => this.height,
      leftSize: () => this.leftSize,
      rightSize: () => this.rightSize,
    };
  }
}
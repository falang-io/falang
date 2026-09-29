import { action, computed, makeObservable, observable } from 'mobx';
import { DEFAULT_NUMBER_COMPUTED, type TNumberComputed } from '../types/computed-value.js';

export abstract class FlowNodeStore {
  @observable private _x: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  @observable private _y: TNumberComputed = DEFAULT_NUMBER_COMPUTED;

  constructor() {
    makeObservable(this);
  }

  @computed get x(): number {
    return this._x();
  }

  @computed get y(): number {
    return this._y();
  }

  @action setPosition({ x, y }: { x: TNumberComputed; y: TNumberComputed }): void {
    this._x = x;
    this._y = y;
  }

  abstract get left(): number;
  abstract get right(): number;
  abstract get height(): number;

  dispose(): void {
    this._x = DEFAULT_NUMBER_COMPUTED;
    this._y = DEFAULT_NUMBER_COMPUTED;
  }
}

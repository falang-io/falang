import { action, makeObservable, observable } from 'mobx';

export class MousePositionStore {
  @observable private _x = 0;
  @observable private _y = 0;

  constructor() {
    makeObservable(this);
  }

  @action set({ x, y, }: { x: number, y: number }) {
    this._x = x;
    this._y = y;
  }

  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }
}
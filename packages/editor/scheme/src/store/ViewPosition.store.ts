import { action, computed, makeObservable, observable } from 'mobx';
import { MAX_SCALE, MIN_SCALE } from '../common/constants';

interface OnMouseWheelParams {
  x: number
  y: number
  wheeldy: number
}

export class ViewPositionStore {
  @observable private _x = 0;
  @observable private _y = 0;
  @observable private _scale = 1;
  @observable isMoving = false;

  constructor() {
    makeObservable(this);
  }

  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }

  get scale(): number {
    return this._scale;
  }

  @action zoomScale(dScale: number, x: number, y: number) {

    const scale = this._scale;
    const nowX = this._x;
    const nowY = this._y;
    let newScale = this._scale * dScale;
    newScale = Math.min(newScale, MAX_SCALE);
    newScale = Math.max(newScale, MIN_SCALE);
    const scaleFactor = newScale / scale;

    const deltaX = x - nowX;
    const deltaY = y - nowY;
    const newDeltaX = deltaX * scaleFactor;
    const newDeltaY = deltaY * scaleFactor;

    const newX = Math.round(x - newDeltaX);
    const newY = Math.round(y - newDeltaY);
    newScale = Math.round((newScale) * 1000) / 1000;

    this._x = newX;
    this._y = newY;
    this._scale = newScale;
  } 


  @action zoom({ x, y, wheeldy }: OnMouseWheelParams) {

    const scale = this._scale;
    const nowX = this._x;
    const nowY = this._y;
    const multiplier = (window as any).chrome ? 4 : 2;
    let scaleFactor = (1000 - wheeldy * multiplier) / 1000;

    let newScale = scale * scaleFactor;
    newScale = Math.min(newScale, MAX_SCALE);
    newScale = Math.max(newScale, MIN_SCALE);
    scaleFactor = newScale / scale;

    const deltaX = x - nowX;
    const deltaY = y - nowY;
    const newDeltaX = deltaX * scaleFactor;
    const newDeltaY = deltaY * scaleFactor;

    const newX = Math.round(x - newDeltaX);
    const newY = Math.round(y - newDeltaY);
    newScale = Math.round((newScale) * 1000) / 1000;

    this._x = newX;
    this._y = newY;
    this._scale = newScale;
  }

  @action move(dx: number, dy: number) {
    this._x += dx;
    this._y += dy;
  }

  @action setPosition(x: number, y: number) {
    if(!isNaN(x)) {
      this._x = x;  
    }
    if(!isNaN(y)) {
      this._y = y;
    }        
  }

  @computed get transformValue() {
    return `translate(${this.x} ${this.y}) scale(${this.scale})`
  }
}
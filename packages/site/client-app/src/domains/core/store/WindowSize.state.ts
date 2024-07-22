import { action, computed, makeObservable, observable } from 'mobx';

export class WindowSizeState {
  @observable private _width = window.innerWidth;
  @observable private _height = window.innerHeight;

  constructor() {
    makeObservable(this);
    window.addEventListener("resize", () => { this.onResize() });
  }

  @action private onResize(): void {
    this._width = window.innerWidth;
    this._height = window.innerHeight;
  }

  @computed get height(): number {
    return this._height
  }

  @computed get width(): number {
    return this._width;
  }
  
  @computed get isMobile(): boolean {
    return this._width < 800;
  }


}

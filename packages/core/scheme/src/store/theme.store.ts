import { action, makeObservable, observable } from 'mobx';
import type { ITheme } from '../types/theme.js';

export const defaultTheme = {
  background: 'rgb(192, 224, 232)',
  gridColor: '#ccc',
  iconBackground: 'white',
  iconBorderColor: 'black',
  textColor: 'black',
  selectedBorderColor: '#1668dc',
} as const satisfies ITheme;

export class ThemeStore {
  @observable.ref private _theme: ITheme = defaultTheme;

  constructor() {
    makeObservable(this);
  }

  get value(): ITheme {
    return this._theme;
  }

  @action setTheme(theme: ITheme) {
    this._theme = theme;
  }
}

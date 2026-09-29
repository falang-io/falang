import { action, makeObservable, observable } from 'mobx';
import type { TExportLanguage } from '@falang/logic-dto';

export class LogicExportConfigurationStoreItem {
  @observable private _language: TExportLanguage = 'ts';
  @observable private _path = './code/src/falang';

  constructor() {
    makeObservable(this);
  }

  get language() {
    return this._language;
  }

  get path() {
    return this._path;
  }

  @action setLanguage(lang: TExportLanguage) {
    this._language = lang;
  }

  @action setPath(path: string) {
    this._path = path;
  }
}

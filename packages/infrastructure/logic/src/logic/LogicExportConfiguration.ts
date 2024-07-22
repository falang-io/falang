import { action, makeObservable, observable } from "mobx";

export const LogicExportLanguages = ['ts', 'rust', 'cpp', 'sharp', 'golang', 'js', 'js-file'] as const;

export interface ILogicOption {
  text: string,
  value: TExportLanguage,
}

export type TExportLanguage = typeof LogicExportLanguages[number];

export interface ILogicExportConfigurationItem {
  language: TExportLanguage,
  path: string
}

export interface ILogicExportConfiguration {
  exports: ILogicExportConfigurationItem[]
}

export class LogicExportConfigurationStoreItem {
  @observable private _language: TExportLanguage = 'ts';
  @observable private _path: string = './code/src/falang';
  constructor() {
    makeObservable(this);
  }

  get language() { return this._language; }
  get path() { return this._path; }

  @action setLanguage(lang: TExportLanguage) {
    this._language = lang;
  }

  @action setPath(path: string) {
    this._path = path;
  }
}

export class LogicExportConfigurationStore {
  readonly items = observable<LogicExportConfigurationStoreItem>([]);
  private oldConfig: ILogicExportConfiguration | null = null;
  constructor() {
    makeObservable(this);
  }

  @action addNewItem(config?: ILogicExportConfigurationItem) {
    const newItem = new LogicExportConfigurationStoreItem();
    if (config) {
      newItem.setLanguage(config.language);
      newItem.setPath(config.path);
    }
    this.items.push(newItem);
  }

  @action deleteItem(index: number) {
    this.items.splice(index, 1);
  }

  getConfig(): ILogicExportConfiguration {
    return {
      exports: this.items.map((item) => ({
        language: item.language,
        path: item.path,
      })),
    }
  }

  @action setConfig(config: ILogicExportConfiguration) {
    this.items.clear();
    config.exports.forEach((cfg) => {
      this.addNewItem(cfg);
    });
  }

  saveConfig() {
    this.oldConfig = this.getConfig();
  }

  restoreOldConfig() {
    if (!this.oldConfig) return;
    this.setConfig(this.oldConfig);
  }

  getLogicOptions(): ILogicOption[] {
    return LogicExportLanguages.map((l) => ({
      text: l,
      value: l,
    }));
  }
}
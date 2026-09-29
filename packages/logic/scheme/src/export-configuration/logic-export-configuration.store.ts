import { action, makeObservable, observable } from 'mobx';
import type { ILogicExportConfiguration, ILogicExportConfigurationItem, TExportLanguage } from '@falang/logic-dto';
import { LogicExportLanguages } from '@falang/logic-dto';
import { LogicExportConfigurationStoreItem } from './logic-export-configuration-item.store.js';

export interface ILogicOption {
  readonly text: string;
  readonly value: TExportLanguage;
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
    };
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
    return LogicExportLanguages.map((language) => ({
      text: language,
      value: language,
    }));
  }
}

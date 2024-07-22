import { FrontRootStore, IContextMenuItem, IFile } from '@falang/frontend-core';
import { computed, makeObservable, observable, runInAction } from 'mobx';
import { FC } from 'react';
import { ISelectOption } from '@falang/editor-scheme';
import { ProjectStore } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { LogicProjectSettingsComponent } from './cmp/LogicProjectSettings.cmp';
import { CppLogicBuilder } from './code-generation/cpp/CppLogicBuilder';
import { GoLogicBuilder } from './code-generation/golang/GoLogicBuilder';
import { JavascriptLogicBuilder } from './code-generation/js/JavaScriptLogicBuilder';
import { RustLogicBuilder } from './code-generation/rust/RustLogicBuilder';
import { rustLogicIconsBuilder } from './code-generation/rust/rustLogicIconsBuilder';
import { SharpLogicBuilder } from './code-generation/sharp/SharpLogicBuilder';
import { TypescriptLogicBuilder } from './code-generation/ts/TypeScriptLogicBuilder';
import { typescriptLogicIconsBuilder } from './code-generation/ts/typescriptLogicIconsBuilder';
import { TVariableInfo, TObjectProperties, IObjectTypeInfo } from './constants';
import { IStructureTypeItem } from './ILogicProjectType';
import { ILogicExportConfiguration, LogicExportConfigurationStore } from './LogicExportConfiguration';
import { loadAvailableApis } from './util/loadAvailableApis';
import { IAvailableEnumItem, loadAvailableEnums } from './util/loadAvailableEnums';
import { IAvailableFunctionItem, loadAvailableFunctions } from './util/loadAvailableFunctions';
import { loadAvailableStructures } from './util/loadAvailableStructures';

const EXPORT_CONFIG_FILENAME = 'export';

export class LogicProjectStore extends ProjectStore {
  readonly availableFunctions = observable<IAvailableFunctionItem>([], { deep: false });
  readonly availableApis = observable<IAvailableFunctionItem>([], { deep: false });
  readonly availableStructures = observable<IStructureTypeItem>([], { deep: false });
  readonly availableEnums = observable<IAvailableEnumItem>([], { deep: false });
  readonly exportConfiguration = new LogicExportConfigurationStore();
  @observable private _rootPath = ''

  constructor(readonly frontRoot: FrontRootStore) {
    super(frontRoot);
    makeObservable(this);
  }

  className = 'LogicProjectStore'


  async reload() {
    const dir = await this.frontRoot.getProjectStructure();
    const [
      functions,
      structures,
      enums,
      apis,
      exportConfiguration,
      rootPath,
    ] = await Promise.all([
      loadAvailableFunctions(this.frontRoot, dir),
      loadAvailableStructures(this.frontRoot, dir),
      loadAvailableEnums(this.frontRoot, dir),
      loadAvailableApis(this.frontRoot, dir),
      this.readConfigFile<ILogicExportConfiguration>(EXPORT_CONFIG_FILENAME),
      this.frontRoot.getRootPath(),
    ]);
    runInAction(() => {
      this.availableFunctions.replace(functions);
      this.availableStructures.replace(structures);
      this.availableEnums.replace(enums);
      this.availableApis.replace(apis);
      if(exportConfiguration) {
        this.exportConfiguration.setConfig(exportConfiguration);
      }
      this._rootPath = rootPath;
    });
  }

  get rootPath() {
    return this._rootPath;
  }

  afterFileSaved(path: string, scheme: SchemeStore): void {
    this.reload();
  }

  async init() {
    await this.reload();
  }

  getFunctionDataById(id: string): IAvailableFunctionItem | null {
    return this.availableFunctions.find((f) => f.schemeId == id) ?? null;
  }

  getApiDataById(schemeId: string, iconId: string) {
    return this.availableApis.find((f) => f.schemeId == schemeId && f.iconId === iconId) ?? null;
  }

  dispose() {
    this.availableEnums.clear();
    this.availableStructures.clear();
    this.availableFunctions.clear();
  }

  validateSchemeName(name: string): void {
    if (!NameRegep.test(name)) {
      const text = this.frontRoot.lang.t('logic:wrong_scheme_name');
      throw new Error(text);
    }
  }

  @computed get availableEnumsOptions(): ISelectOption[] {
    return this.availableEnums.map((e) => ({
      text: e.name,
      value: `${e.schemeId}|||${e.iconId}`,
    }));
  }

  getEnumName(iconId: string, schemeId: string) {
    const enm = this.availableEnums.find((e) => e.iconId === iconId && e.schemeId === schemeId);
    if (!enm) return '';
    return enm.name;
  }

  getEnum(iconId: string, schemeId: string): IAvailableEnumItem | null {
    return this.availableEnums.find((e) => e.iconId === iconId && e.schemeId === schemeId) ?? null;
  }

  getStruct(iconId: string, schemeId: string): IStructureTypeItem | null {
    const struct = this.availableStructures.find((e) => e.iconId === iconId && e.schemeId === schemeId) ?? null;
    if(!struct) return null;
    return struct;
  }

  getStructByType(type: IObjectTypeInfo): IStructureTypeItem | null {
    return this.getStruct(type.iconId, type.schemeId);
  }

  /**
   * В ДТО структура хранится не полностью. Тут мы ввнимаем все дочерние объекты/
   * Отменено
   * @param type 
   * @deprecated
   * @returns 
   */
  getFilledType(type: TVariableInfo): TVariableInfo {
    return type;
  }

  getMenu(): IContextMenuItem[] {
    const t = this.frontRoot.lang.t;
    return [{
      text: t('logic:build_code'),
      onClick: () => this.buildCode(),
    }];
  }

  async buildCode(silent = false): Promise<boolean> {
    const t = this.frontRoot.lang.t;
    let k: string | null = null;
    try {
      if(!silent) {
        k = this.frontRoot.toaster.show({
          message: t('logic:build_started'),
          intent: 'none',
          icon: 'info-sign',
        });
      }

      const exportConfigs = this.exportConfiguration.items;
      if(!exportConfigs.length) {
        throw new Error(t('logic:export_not_setup'));
      }
      const structure = await this.frontRoot.getProjectStructure();
      for(const exportItem of exportConfigs) {
        const outputPath = await this.frontRoot.fs.resolvePath(this.rootPath, exportItem.path);
        switch(exportItem.language) {
          case 'ts': {
            const builder = new TypescriptLogicBuilder({
              iconBuilders: typescriptLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          case 'js': {
            const builder = new JavascriptLogicBuilder({
              iconBuilders: typescriptLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          case 'js-file': {
            const builder = new JavascriptLogicBuilder({
              iconBuilders: typescriptLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
              singleFile: true,
            });
            await builder.build();
          } break;
          case 'rust': {
            const builder = new RustLogicBuilder({
              iconBuilders: rustLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          case 'cpp': {
            const builder = new CppLogicBuilder({
              iconBuilders: rustLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          case 'sharp': {
            const builder = new SharpLogicBuilder({
              iconBuilders: rustLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          case 'golang': {
            const builder = new GoLogicBuilder({
              iconBuilders: rustLogicIconsBuilder,
              indexPath: structure.path,
              outpuPath: outputPath,
              project: this,
              projectPath: structure.path,
            });
            await builder.build();
          } break;
          default:
            this.frontRoot.toaster.show({
              message: `${t('logic:cant_build_for_language')}: ${exportItem.language}`,
              intent: 'none',
              icon: 'warning-sign',
            });
            continue;
        }
      }
      if (k) this.frontRoot.toaster.dismiss(k);
      if(!silent) {
        this.frontRoot.toaster.show({
          message: t('logic:build_finished'),
          intent: 'success',
          icon: 'flame',
        });
      }
      return true;
    } catch (err) {
      console.error(err);
      if (k) this.frontRoot.toaster.dismiss(k);
      if(!silent) {
        this.frontRoot.toaster.show({
          message: `${t('logic:build_error')}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
          intent: 'danger',
          icon: 'error',
        });
      }
      return false;
    }
  }

  async beforeSettingsOpened(): Promise<void> {
    this.exportConfiguration.saveConfig();
  }

  async cancelSettings(): Promise<void> {
    this.exportConfiguration.restoreOldConfig();
  }

  async saveSettings(): Promise<void> {
    await this.saveConfigFile(EXPORT_CONFIG_FILENAME, this.exportConfiguration.getConfig());
  }

  getSettingsComponent(): FC<{ project: any; }> {
    return LogicProjectSettingsComponent;
  }
}

const NameRegep = /^[a-zA-Z][a-zA-Z0-9_-]+$/;

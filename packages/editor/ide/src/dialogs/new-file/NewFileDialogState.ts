import { action, computed, makeObservable, observable } from 'mobx';
import { BaseDialogState } from '../BaseDialogState';;
import { FILE_EXTENSION } from '../../constants';
import { IdeDirectoryStore } from '../../store/IdeDirectories.store';
import { TProjectTypeName } from '@falang/infrastructures-all';

export interface INewFileOption {
  name: string
  template: string
}

export class NewFileDialogState extends BaseDialogState {
  readonly name = "new-file";
  @observable directory: IdeDirectoryStore | null = null;
  @observable selecedTemplate = "";
  @observable fileName = "";
  readonly newFileOptions = observable<INewFileOption>([]);
  @observable type: TProjectTypeName | null = null;

  constructor(...args: ConstructorParameters<typeof BaseDialogState>) {
    super(...args);
    makeObservable(this);
  }

  @action showForDirectory(type: TProjectTypeName, directory: IdeDirectoryStore) {
    this.directory = directory ?? null;
    this.fileName = 'NewScheme';
    this.type = type;
    const options: INewFileOption[] = [];
    this.dialogs.ide.projectType?.config.documentsConfig.forEach((cfg) => {
      options.push({
        name: cfg.name,
        template: cfg.name
      });
    });
    this.newFileOptions.replace(options);
    this.selecedTemplate = this.newFileOptions[0].template;
    this.showBase();
  }

  async createFile() {
    if(this.validationError !== null) {
      return;
    }
    const ide = this.dialogs.ide;
    if(!this.directory || !this.type) {
      throw new Error(ide.frontRoot.lang.t('file:directory-did-not-set'));
    }
    const fs = ide.fileSystem;
    const targetFilePath = await fs.resolvePath(this.directory.path, `${this.fileName}.${FILE_EXTENSION}`);    
    const fileExists = await fs.fileExists(targetFilePath);
    if(fileExists) {
      ide.frontRoot.toaster.show({
        message: ide.frontRoot.lang.t('file:already-exists'),
        intent: 'danger'
      });
      return;
    }
    this.hide();
    this.dialogs.ide.filesService.createFile(this.type, this.selecedTemplate, this.fileName, this.directory.path);
  }

  @action setSelectedTemplate(template: string) {
    //console.log(template);
    this.selecedTemplate = template;
  }

  @action setFileName(fileName: string) {
    this.fileName = fileName;
  }

  @computed get validationError(): string | null {
    try {
      this.dialogs.ide.projectStore?.validateSchemeName(this.fileName)
    } catch (err) {
      return err instanceof Error ? err.message : 'Unknown error';
    }
    return null;
  }
}

import { TProjectTypeName, TProjectTypes, ProjectTypesNames, extraProjects } from '@falang/infrastructures-all';
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { PROJECT_EXTENSION } from '../../constants';
import { BaseDialogState } from '../BaseDialogState';

export class NewProjectDialogState extends BaseDialogState {
  readonly name = "new-project";
  @observable selecedType: string | null = null;
  @observable projectName = "";
  @observable directory = "";
  @observable directoryChangeByUser = false;
  @observable showDeprecated = false;
  readonly types = ProjectTypesNames;
  readonly extraTypes = extraProjects;

  constructor(...args: ConstructorParameters<typeof BaseDialogState>) {
    super(...args);
    makeObservable(this);
  }

  @action show() {
    this.showDeprecated = false;
    this.projectName = 'NewProject';
    this.directory = "";
    this.directoryChangeByUser = false;
    super.showBase();
    this.setNewDirectoryPath();
  }

  @computed get projectTypes(): Array<{ label: string, value: string }> {
    if (!this.types) return [];
    const t = this.dialogs.ide.frontRoot.lang.t;
    return this.types.map((type) => ({      
      label: t(`project:type:${type}`),
      value: type,
    }))
  }

  async selectDirectory() {
    const directory = await this.dialogs.ide.fileSystem.openDirectory(this.directory);
    if (directory !== null) {
      runInAction(() => {
        this.setDirectory(directory);
      })
    }
  }

  private async setNewDirectoryPath() {
    const documentsPath = await this.dialogs.ide.fileSystem.getAppPath("documents");
    const projectName = this.projectName;
    let index = 0;
    while (true) {
      index++;
      const newProjectName = `${projectName}${index > 1 ? index : ''}`;
      const newProjectPath = await this.dialogs.ide.fileSystem.resolvePath(documentsPath, 'Falang', newProjectName);
      const exists = await this.dialogs.ide.fileSystem.fileExists(newProjectPath);
      if (exists) continue;
      runInAction(() => {
        this.projectName = newProjectName;
        this.directory = newProjectPath;
      });
      break;
    }
  }

  async createProject() {
    if (!this.projectName.length) {
      this.dialogs.ide.frontRoot.toaster.show({
        message: 'Empty project name',
        intent: 'danger',
      });
      return;
    }
    const fs = this.dialogs.ide.fileSystem;
    const directoryExists = await fs.fileExists(this.directory);
    const projectFilePath = await fs.resolvePath(this.directory, `project.${PROJECT_EXTENSION}`);
    if (directoryExists) {
      if (await fs.fileExists(projectFilePath)) {
        this.dialogs.ide.frontRoot.toaster.show({
          message: this.dialogs.ide.frontRoot.lang.t('project:project_exists'),
          intent: 'danger',
        });
        return;
      }
    } else {
      try {
        await fs.createDirectory(this.directory)
      } catch (err: any) {
        this.dialogs.ide.frontRoot.toaster.show({
          message: err.message,
          intent: 'danger',
        });
        return;
      }
    }
    if (!this.selecedType) {
      this.dialogs.ide.frontRoot.toaster.show({
        message: this.dialogs.ide.frontRoot.lang.t('project:please_select_type'),
        intent: 'danger',
      });
      return;
    }
    this.hide();
    this.dialogs.ide.filesService.createProject(this.selecedType as TProjectTypeName, this.directory, this.projectName);
  }

  @action setSelectedType(type: string) {
    //console.log(type);
    this.selecedType = type;
  }

  @action setProjectName(projectName: string) {
    this.projectName = projectName;
    if (!this.directoryChangeByUser) {
      this.setNewDirectoryPath();
    }
  }

  @action setDirectory(path: string) {
    this.directoryChangeByUser = true;
    this.directory = path;
  }
}

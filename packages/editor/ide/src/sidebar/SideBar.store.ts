import { action, computed, makeObservable, observable, reaction, runInAction } from 'mobx';
import { IdeStore, TActivitiesTabName } from '../Ide.store';
import { IdeDirectoryStore, IdeFileStore } from '../store/IdeDirectories.store';
import { SideBarInstrumentsStore } from './instruments/SideBarInstruments.store';

export class SideBarStore {
  readonly instruments: SideBarInstrumentsStore;
  @observable width = 300;
  @observable isInResizing = false;
  @observable startResizingWidth = 0;
  @observable startResizingMouseX = 0;

  constructor(readonly ide: IdeStore) {
    this.instruments = new SideBarInstrumentsStore(ide);
    makeObservable(this);
    reaction(
      () => this.ide.rootPath,
      (path) => {
        if(path) this.readConfig();
      }
    );
  }

  private async readConfig() {
    const configPath = await this.ide.getConfigFilePath(this.ide.rootPath);
    /*console.log({
      configPath,
      root: this.ide.rootPath
    });*/
    const config = JSON.parse(await this.ide.fileSystem.loadFile(configPath));
    const sideBarWidth = config.sideBarWidth
    if (typeof sideBarWidth === 'number') {
      runInAction(() => {
        this.width = sideBarWidth;
      })
    }
  }

  @action startResizing(e: React.MouseEvent<any, any>) {
    this.isInResizing = true;
    this.startResizingWidth = this.width;
    this.startResizingMouseX = e.clientX;
  }

  @action mouseMove(e: React.MouseEvent<any, any>) {
    if (!this.isInResizing) return;
    if(e.buttons !== 1) {
      this.mouseUp();
      return;
    }
    let newWidth = this.startResizingWidth + e.clientX - this.startResizingMouseX;
    newWidth = Math.max(newWidth, 50);
    newWidth = Math.min(newWidth, 500);
    this.width = newWidth;
  }

  @action openDirectory(directory: IdeDirectoryStore) {
    directory.opened = true;
  }

  @action closeDirectory(directory: IdeDirectoryStore) {
    directory.opened = false;
  }

  @action fileClicked(file: IdeFileStore): void {
    const index = this.ide.getFileIndex(file.path);
    if (index >= 0) {
      this.ide.activeTabIndex = index;
      return;
    }
    this.ide.filesService.loadFile(file.path);
  }

  @action fileDoubleClicked(file: IdeFileStore): void {
    const index = this.ide.getFileIndex(file.path);
    if (index >= 0) {
      this.ide.activeTabIndex = index;
      this.ide.tabs[index].fixed = true;
      return;
    }
    this.ide.filesService.loadFile(file.path).then((tab) => {
      runInAction(() => {
        if(tab) tab.fixed = true;
      })
    });
  }

  @action mouseUp() {
    if (!this.isInResizing) return;
    this.isInResizing = false;
    /*this.ide.updateConfig({
      defaultIconBackground
    });*/
  }
}
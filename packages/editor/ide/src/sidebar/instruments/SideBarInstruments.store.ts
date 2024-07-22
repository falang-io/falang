import { IconStore } from '@falang/editor-scheme';
import { IContextMenuItem } from '@falang/frontend-core';
import { action, computed, makeObservable, observable, reaction, runInAction } from 'mobx';
import { FILE_EXTENSION } from '../../constants';
import { IdeStore } from '../../Ide.store';
import { IdeDirectoryStore, IdeFileStore } from '../../store/IdeDirectories.store';
import { ProjectSchemeEditorTabStore } from '../../store/tabs/SchemeEditorTab.store';

export class SideBarInstrumentsStore {
  @observable pickerVisible = false;
  @observable schemePickerVisible = false;
  @observable currentColor: string = "#FFFFFF";
  @observable currentSchemeBackgroundColor: string = "#C0E0E8";

  constructor(readonly ide: IdeStore) {
    makeObservable(this);
    setTimeout(() => this.initReactions());
  }

  private initReactions() {
    reaction<[string | undefined]>(() => [
      this.ide.defaultIconBackground,
    ], ([color]) => {
      if (!color || this.isIconsSelected) return;
      this.currentColor = color;
    });
    reaction<string | undefined>(() => this.ide.backgroundColor, (color) => {
      if (!color) return;
      this.currentSchemeBackgroundColor = color;
    });
    reaction<string[]>(() => this.selectedColors, (colors) => {
      if (!colors.length) {
        this.currentColor = this.ide.defaultIconBackground || '#FFFFFF';
        return;
      }
      if (colors.length === 1) {
        this.currentColor = colors[0];
        return;
      }
      this.currentColor = '';
    });
  }

  @action setCurrentColor(color: string) {
    this.currentColor = color;
    if (!color.match(/^#[a-zA-Z0-9]{6}$/)) return;
    if (this.isIconsSelected) {
      const icons = this.selectedIcons;
      runInAction(() => {
        for (const icon of icons) {
          if (!icon.block.colorEditable) continue;
          icon.block.color = color;
        }
      });
    } else {
      this.ide.updateConfig({
        defaultIconBackground: color,
      });
    }
  }

  @action setSchemeBackgroundColor(color: string) {
    this.currentSchemeBackgroundColor = color;
    if (!color.match(/^#[a-zA-Z0-9]{6}$/)) return;
    this.ide.updateConfig({
      schemeBackground: color,
    });
  }

  @computed get selectedColors(): string[] {
    const colors = new Set<string>(this.selectedIcons.map(icon => icon.block.color));
    return Array.from(colors);
  }

  @computed get isIconsSelected(): boolean {
    const selectedTab = this.ide.activeTab;
    if (!(selectedTab instanceof ProjectSchemeEditorTabStore)) {
      return false;
    }
    return selectedTab.scheme.selection.isSomeSelected;
  }

  @computed get selectedIcons(): IconStore[] {
    const selectedTab = this.ide.activeTab;
    if (!(selectedTab instanceof ProjectSchemeEditorTabStore)) {
      return [];
    }
    return selectedTab.scheme.selection.getSelectedIcons();
  }

  @action setPickerVisible(visible: boolean) {
    this.pickerVisible = visible;
  }

  @action setSchemePickerVisible(visible: boolean) {
    this.schemePickerVisible = visible;
  }

  showContextMenuForTree(state: IdeDirectoryStore | IdeFileStore, x: number, y: number) {
    const t = this.ide.frontRoot.lang.t;
    if (state instanceof IdeDirectoryStore) {
      const menu: IContextMenuItem[] = [{
        text: t('file:new-file'),
        onClick: async () => {
          this.ide.dialogs.newFileDialog.showForDirectory(this.ide.projectTypeName, state);
        },
      }, {
        text: t('file:new-directory'),
        onClick: async () => {
          const name = await this.ide.dialogs.prompt(t('file:enter-directory-name'));
          if (!name) return;
          try {
            this.ide.projectStore?.validateSchemeName(name);
          } catch (err) {
            this.ide.frontRoot.toaster.show({
              message: err instanceof Error ? err.message : 'Unknown error',
              intent: 'danger',
            });
          }
          const path = await this.ide.fileSystem.resolvePath(state.path, name);
          await this.ide.fileSystem.createDirectory(path);
          this.ide.filesService.reloadDirectories();
        },
      }];
      if (state !== this.ide.rootDirectory) {
        menu.push({
          text: t('file:rename'),
          onClick: async () => {
            const newName = await this.ide.dialogs.prompt(t('file:enter-directory-name'), state.name);
            if (!newName) return;
            const path = await this.ide.fileSystem.resolvePath(state.path, '..', newName);
            const oldPath = state.path;
            await this.ide.fileSystem.renameFile(state.path, path);
            runInAction(() => {
              state.path = path;
              this.ide.getSchemasTabs().forEach((tab) => {
                if (tab.path === oldPath) tab.scheme.documentPath = path;
              });
            });
            this.ide.filesService.reloadDirectories();
          },
        }, {
          text: t('base:delete'),
          onClick: async () => {
            if (!confirm(t('file:delete-directory-confirm'))) return;
            await this.ide.fileSystem.deleteDirectory(state.path);
            this.ide.filesService.reloadDirectories()
          },
        });
      }
      this.ide.frontRoot.contextMenu.showMenu(menu, x, y)
    } else {
      this.ide.frontRoot.contextMenu.showMenu([{
        text: t('file:rename'),
        onClick: async () => {
          const newName = await this.ide.dialogs.prompt(t('file:enter-new-file-name'), state.name);
          if (!newName) return;
          const path = await this.ide.fileSystem.resolvePath(state.path, '..', `${newName}.${FILE_EXTENSION}`);
          await this.ide.fileSystem.renameFile(state.path, path);

          for (const tab of this.ide.tabs) {
            if (tab.path === state.path && tab instanceof ProjectSchemeEditorTabStore) {
              runInAction(() => {
                state.name = newName;
                tab.scheme.name = newName;                
                state.path = path;
                tab.path = path;                
                tab.scheme.documentPath = path;
                tab.onSave();
              });
            }
          }
          this.ide.filesService.reloadDirectories();
        },
      }, {
        text: t('file:delete'),
        onClick: async () => {
          if (!confirm(t('file:delete-file-confirm'))) return;
          await this.ide.fileSystem.deleteFile(state.path);
          this.ide.filesService.reloadDirectories();
        },
      }], x, y)
    }
  }
}
import { EmptyInfrastructureType, SchemeStore } from '@falang/editor-scheme';
import { FrontRootStore, IFileSystemService, plugFileSystem } from '@falang/frontend-core';
import {TextInfrastructureType, TextProjectStore} from '@falang/infrastructures-all';
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { DropDownMenuStore } from '../../core/dropdown/store/DropDownMenuState';
import { LangState } from '@falang/frontend-core';
import { emptyInfrastructureConfig } from '@falang/editor-scheme';
import { api } from '../../api/api';
import { DocumentDto } from '../../api';
import { TDocumentVisibility, ResponseDocumentDto } from '../../api';
import { LocalStore } from '../../core/store/LocalStore';
import { TSchemeMode } from '@falang/editor-scheme';
import { ModalsStore } from '../../core/modals/ModalsStore';
import { RootStore } from '../../core/store/Root.store';
import { nanoid } from 'nanoid';
import { getDocumentConfig, infrastructures } from '@falang/infrastructures-all';
import moment from 'moment';
import { getClipboardService } from '../../core/lib/Clipboard.service';

export interface IDocumentEditorStoreParams {
  dropdown: DropDownMenuStore
  lang: LangState
  modals: ModalsStore
  root: RootStore
}

export class DocumentEditorPageStore {
  @observable editor: SchemeStore;
  @observable isSaving = false;
  @observable visibility: TDocumentVisibility = 'private';
  @observable lastSaved: string | null = null;
  @observable projectTemplate = '';
  @observable schemeTemplate = '';
  @observable description = '';
  @observable authorUsername = '';
  @observable private busyIndex = 0;
  @observable loaded = false;
  readonly localStore = new LocalStore();
  readonly fs: IFileSystemService = plugFileSystem;
  readonly frontRootStore: FrontRootStore;
  readonly modals: ModalsStore;
  readonly root: RootStore;
  @observable minuteIndex = 0;
  private minuteTimer: NodeJS.Timer | null = null;
  private isChangedAfterSavingStarted = false;

  constructor({ dropdown, lang, modals, root }: IDocumentEditorStoreParams) {
    this.root = root;
    this.modals = modals;
    this.frontRootStore = new FrontRootStore({
      lang,
      contextMenu: dropdown,
      fs: this.fs,
      clipboard: getClipboardService(),
      getDomRectById: (id) => {
        const element = window.document.getElementById(id);
        if (!element) throw new Error(`Element not found by id: ${id}`);
        return element.getBoundingClientRect();
      },
      getProjectStructure() {
        return Promise.resolve({
          directories: [],
          files: [{
            id: 'id',
            name: 'name',
            path: '/falang/schemas/doc.falang.json',
            type: 'function',
          }],
          name: '',
          path: '/',
        })
      },
      getRootPath() {
        return Promise.resolve('');
      },
      links: {
        getLinkInfo(projectRoot, id) {
          throw new Error('Not implemented');
        },
        getLinksOptions(projectRoot) {
          throw new Error('Not implemented');
        },
        linkClicked(id) {
          throw new Error('Not implemented');
        },
      },
      async loadFile(path) {
        throw new Error('Not implemented');
      },
      messageBox: {
        show(params) {
          throw new Error('Not implemented');
        },
      },
    });
    this.editor = new SchemeStore(this.frontRootStore, new EmptyInfrastructureType(emptyInfrastructureConfig), '', '', '', new TextProjectStore(this.frontRootStore));
    makeObservable(this);
  }

  @computed get busy() {
    return this.busyIndex > 0;
  }

  @action saveDocument() {
    if(this.isSaving) {
      this.isChangedAfterSavingStarted = true;
      return;
    }
    this.isChangedAfterSavingStarted = false;
    this.isSaving = true;
    const json = this.getJson();
    if (!this.isLocalStorageDocument) {
      api.documents.updateDocument({
        ...json,
        latestVersionHash: '',
        visibility: this.visibility,
        description: this.description,
      }).then(async () => {
        runInAction(() => {
          this.isSaving = false;
          this.lastSaved = (new Date()).toISOString();
          if (this.isChangedAfterSavingStarted) {
            setTimeout(() => this.saveDocument(), 50);
          }
        });
      }).catch((err) => {
        console.error(err);
        runInAction(() => this.isSaving = false);
        setTimeout(() => this.saveDocument(), 50);
      });
    } else {
      this.localStore.saveDocument(json);
    }
  }

  load(id: string, mode: TSchemeMode = 'edit') {
    if(this.minuteTimer) {
      clearInterval(this.minuteTimer);
      this.minuteTimer = null;
    }
    this.waitFor(async () => {
      if (id !== 'local') {
        let result: ResponseDocumentDto;
        try {
          result = await api.documents.getSingleDocument({ id });
        } catch (err: any) {
          this.modals.alert.showAlert(err.message);
          return;
        }
        /*if (result.author !== this.user.username && mode === 'edit') {
          this.router.goTo(this.routes.viewDocument, { id });
          return;
        }*/
        this.loadFromJson(result);
        runInAction(() => {
          this.authorUsername = result.author ?? '';
        });
        this.setLastSaved(result.updated);
      } else {
        const localJson = this.localStore.getDocument();
        if (!localJson) throw new Error('Document not found');
        this.loadFromJson(localJson);
        runInAction(() => {
          this.authorUsername = '';
        });
        this.setLastSaved('');
      }
      runInAction(() => {
        this.editor.mode = mode;
        this.editor.onChange = () => {
          this.saveDocument();
        }
        this.loaded = true;
        this.minuteIndex = 0;
        this.minuteTimer = setInterval(() => {
          runInAction(() => {
            this.minuteIndex++;
          });
        }, 60000);
      })
    });
  }

  @action unload() {
    this.loaded = false;
    this.editor.dispose();
    if(this.minuteTimer) {
      clearInterval(this.minuteTimer);
      this.minuteTimer = null;
    }
  }

  @action setLastSaved(lastSaved: string) {
    this.lastSaved = lastSaved;
  }

  getJson(): DocumentDto {
    const scheme = this.editor.toDto();
    return {
      ...scheme,
      projectTemplate: 'text',
      schemeTemplate: this.editor.root.alias,
      icon: this.editor.root.alias,
      latestVersionHash: '',
      visibility: this.visibility,
    }
  }

  loadFromJson(dto: DocumentDto) {
    runInAction(() => {
      this.editor.dispose();
      this.editor = new SchemeStore(this.frontRootStore, new TextInfrastructureType(), dto.type, '', '', new TextProjectStore(this.frontRootStore));
    });
    runInAction(() => {
      const icon = this.editor.createIconFromDto(dto.root, null);
      this.editor.setRoot(icon);
      this.editor.id = dto.id;
      this.editor.name = dto.name;
      this.description = dto.description;
      this.visibility = dto.visibility;
    });
    setTimeout(() => {
      runInAction(() => {
        this.editor.sheduleCallback.flush();
        this.editor.resetPosition();
      });     
    }, 10);
  }

  @computed get isLocalStorageDocument() {
    return this.editor.id === 'local';
  }

  async waitFor(cb: () => Promise<void>): Promise<void> {
    runInAction(() => this.busyIndex++);
    try {
      const returnValue = await cb();
      return returnValue;
    } catch (err) {
      this.modals.alert.showAlert(err instanceof Error ? err.message: String(err));
      console.error(err);
    } finally {
      runInAction(() => this.busyIndex--);
    }
  }

  @action startEditNotMyDocument() {
    if (this.root.user.loggedIn) {
      this.modals.confirm.ask(this.root.i18n.t('docs:ask_for_copy'), (isCreate) => {
        if (!isCreate) return;
        let json: DocumentDto;
        try {
          json = this.getJson();
        } catch (err: any) {
          this.modals.alert.showAlert(err.message);
          console.error(err);
          throw err;
        }
        json.name = json.name.concat(' ').concat(this.root.i18n.t('docs:copy'));
        json.id = nanoid();
        api.documents.createDocument({
          ...json,
          latestVersionHash: '',
          visibility: this.visibility,
        }).then((result) => {
          this.root.router.goTo(this.root.routes.editDocument, { id: result.id })
        }).catch((err: any) => {
          this.modals.alert.showAlert(err.message);
        });
      });
    } else {
      this.localStore.saveDocument(this.getJson());
      this.root.router.goTo(this.root.routes.editDocument, { id: 'local' })
    }
  }

  @action createNew(templateName: string) {
    this.waitFor(async () => {      
      this.editor.dispose();
      return new Promise<void>((resolve) => {        
        const documentConfig = getDocumentConfig('text', templateName);
        const infrastructure = infrastructures[documentConfig.infrastructure as keyof typeof infrastructures];
        //const template = this.editor.templates.templates['text'].getTemplate(templateName);
        //if (!template) throw new Error('template not found');
        runInAction(() => {
          const projectStore = new TextProjectStore(this.frontRootStore);
          this.editor = new SchemeStore(this.frontRootStore, infrastructure, templateName, '', '', projectStore);
          this.editor.id = nanoid();
          this.editor.name = 'New document'
          this.editor.setRoot(documentConfig.createEmpty(this.editor));
          //this.editor.visibility = 'private';
          //const newRoot = template.createEmpty('New document', this.editor);
          //this.editor.rootId = newRoot.id;
        });
        if (this.root.user.loggedIn) {
          setTimeout(() => {
            runInAction(async () => {
              let json;
              try {
                json = this.editor.toDto();
              } catch (err: any) {
                this.modals.alert.showAlert(err.message);
                console.error(err);
                return resolve();
              }
              api.documents.createDocument({
                ...json,
                latestVersionHash: '',
                visibility: 'private',
                icon: templateName,
                projectTemplate: 'text',
                schemeTemplate: templateName,
              }).then((result) => {
                this.editor.dispose();
                this.root.router.goTo(this.root.routes.editDocument, { id: result.id })
              }).catch((err: any) => {
                this.modals.alert.showAlert(err.message);
              }).finally(() => resolve());
            });
          });
        } else {
          setTimeout(() => {
            const json = this.editor.toDto();
            this.localStore.saveDocument({
              ...json,
              visibility: 'private',
              icon: templateName,
              projectTemplate: 'text',
              schemeTemplate: templateName,
              latestVersionHash: '',
            });
            this.root.router.goTo(this.root.routes.editDocument, { id: 'local' });
            resolve();
          });
        }
      });
    });
  }
  @computed get isMyDocument(): boolean {
    return this.authorUsername === this.root.user.username;
  }
  @computed get lastSavedText(): string {
    if (this.minuteIndex < 0) return '';
    return this.lastSaved ? moment(this.lastSaved).fromNow() : '';
  }
}



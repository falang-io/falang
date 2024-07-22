import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { DocumentListItemDto } from '../../../api';
import { api } from '../../../api/api';
import { BaseStore } from '../../../core/store/Base.store';
import type { RootStore } from '../../../core/store/Root.store';

type TDocumentsListType = 'my' | 'shared';

const LIMIT = 20;

export class DocumentsListStore extends BaseStore {
  readonly list = observable<DocumentListItemDto>([]);
  @observable busy = false;
  @observable type: TDocumentsListType = 'my';
  @observable offset = 0;

  constructor(root: RootStore) {
    super(root);
    makeObservable(this);
  }

  @action load(type: TDocumentsListType) {
    this.type = type;
    runInAction(() => {
      this.list.clear();
    });
    if(!this.root.user.isLodaded) {
      console.log('not loaded');
      runInAction(() => {
        this.busy = true;
      });
      setTimeout(() => {
        runInAction(() => {
          this.busy = false;
          if(this.root.user.isLodaded) {
            this.load(type);
          }
        })
      }, 2000);
      return;
    } else {
      if(this.root.user.loggedIn || this.type !== 'my') {
        runInAction(() => {
          this.busy = true;
        });
        api.documents.getDocumentsList({
          limit: LIMIT,
          offset: this.offset,
          type,
        }).then((result) => {
          this.list.replace(result.items);
        }).catch((err) => {
          this.root.modals.alert.showAlert(err.message);
        }).finally(() => {
          runInAction(() => this.busy = false);      
        });
      }
    }

  }

  @computed get isLoggedIn(): boolean {
    return this.root.user.loggedIn;
  }

  delete(id: string) {
    this.root.modals.confirm.ask('Are you really want to delete document?', (answer) => {
      if(!answer) return;
      runInAction(() => {
        const index = this.list.findIndex((d) => d.id === id);
        if(index === -1) throw new Error(`Doc ${id} not found`)
        this.list.spliceWithArray(index, 1);
        api.documents.deleteDocument({ id });
      });
    });
  }
}
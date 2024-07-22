import { action, makeObservable, observable, override, runInAction } from "mobx";
import { TDocumentVisibility } from '../../../api';
import { api } from '../../../api/api';
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

export class DocumentSettingsModalModel extends ModalModel {

  @observable documentName = "";
  @observable description = "";
  @observable visibility: TDocumentVisibility = 'private';

  constructor(modalState: ModalsStore) {
    super({
      modals: modalState,
      name: 'DocumentSettings',
    });
    makeObservable(this);
  }

  @override reset() {
    this.documentName = this.modals.root.documentEditorPage.editor.name;
    this.description = this.modals.root.documentEditorPage.description;
    this.visibility = this.modals.root.documentEditorPage.visibility;
    super.reset();
  }

  save() {
    this.inBusy(async () => {
      runInAction(() => {
        this.modals.root.documentEditorPage.editor.name = this.documentName;
        this.modals.root.documentEditorPage.description = this.description;
        this.modals.root.documentEditorPage.visibility = this.visibility;
        this.modals.root.documentEditorPage.saveDocument();
      });
      this.modals.closeAll();      
    })
  }

  @action cancel() {
    this.modals.closeAll();
  }
}

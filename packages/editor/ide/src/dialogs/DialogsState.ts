import { SchemeStore } from '@falang/editor-scheme';
import { makeObservable, observable } from 'mobx';
import { IdeStore } from '../Ide.store';
import { NewFileDialogState } from './new-file/NewFileDialogState';
import { NewProjectDialogState } from './new-project/NewProjectDialogState';
import { PromptDialogState } from './prompt/PromptDialogState';
import { SelectLanguageDialogState } from './select-language/SelectLanguageDialogState';

export class DialogsState {
  @observable openedDialogName: string | null = null;
  newFileDialog = new NewFileDialogState(this);
  newProjectDialog = new NewProjectDialogState(this);
  promptDialog = new PromptDialogState(this);
  selectLanguage = new SelectLanguageDialogState(this);
  readonly ide: IdeStore;

  constructor(ide: IdeStore) {
    this.ide = ide;
    makeObservable(this);
  }

  prompt(message: string, defaultValue?: string): Promise<string | null> {
    this.promptDialog.show(message, defaultValue);
    return this.promptDialog.waitForResponse();
  }
}

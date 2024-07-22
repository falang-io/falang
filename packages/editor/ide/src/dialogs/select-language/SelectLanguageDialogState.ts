import { action, computed, makeObservable, observable } from 'mobx';
import { BaseDialogState } from '../BaseDialogState';
import { TLanguage } from '@falang/i18n';

export class SelectLanguageDialogState extends BaseDialogState {
  readonly name = "select-language";
  private resolve: ((value: TLanguage) => void) | null = null;

  constructor(...args: ConstructorParameters<typeof BaseDialogState>) {
    super(...args);
    makeObservable(this);
  }

  @action show() {
    super.showBase();
  }

  waitForResponse(): Promise<TLanguage> {
    return new Promise<TLanguage>((resolve) => {
      this.resolve = resolve;
    });
  }

  @action selectLanguage(language: TLanguage) {
    this.dialogs.ide.frontRoot.lang.setLang(language);
    this.hide();
    this.resolve && this.resolve(language);
  }
}

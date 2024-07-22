import { action, computed, makeObservable, observable } from 'mobx';
import { BaseDialogState } from '../BaseDialogState';

export class PromptDialogState extends BaseDialogState {
  readonly name = "propmt";
  @observable message = "";
  @observable value = "";
  private resolve: ((value: string | null) => void) | null = null;

  constructor(...args: ConstructorParameters<typeof BaseDialogState>) {
    super(...args);
    makeObservable(this);
  }

  @action setValue(value: string) {
    this.value = value;
  }

  @action show(message: string, defaultValue: string = "") {
    this.message = message;
    this.setValue(defaultValue);
    super.showBase();
  }

  waitForResponse(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.resolve = resolve;
    });
  }

  @action ok() {
    if (!this.resolve) return;
    this.resolve(this.value);
    this.resolve = null;
    this.value = "";
    this.hide()
  }

  @action cancel() {
    if (!this.resolve) return;
    this.resolve(null);
    this.resolve = null;
    this.value = "";
    this.hide();
  }
}

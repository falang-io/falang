import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { ApiValidationError } from '../../../api/apiFactory';
import type { RootStore } from '../../store/Root.store';
import type { ModalsStore } from '../ModalsStore';

export type TModalSize = 'sm' | 'lg';

export interface ModalModelParams {
  name: string,
  /**
   * @deprecated
   */
  size?: TModalSize,
  width?: number;
  modals: ModalsStore,
}

export class ModalModel {
  readonly modals: ModalsStore;
  readonly root: RootStore;
  readonly name: string;
  readonly size: TModalSize | null = null;
  readonly width: number | null = null;

  @observable isError = false;
  @observable errorText = '';
  @observable busy = false;
  readonly errorsByField = observable(new Map<string, string>());

  constructor({ name, width, size, modals }: ModalModelParams) {
    this.modals = modals;
    this.root = modals.root;
    this.name = name;
    this.width = width || null;
    if (size) this.size = size;
    makeObservable(this);
  }

  @computed get isVisible() {
    return this.modals.visibleModalName === this.name;
  }

  @computed get dialogStyle(): React.CSSProperties {
    return {
      width: this.width ?? (this.size === 'sm' ? 300 : 500),
    };
  }

  /**
   * @deprecated
   */
  @computed get className() {
    return '';
  }

  @action reset() {
    this.isError = false;
    this.errorText = '';
    this.busy = false;
    this.errorsByField.clear();
  }

  @action show() {
    this.reset();
    this.modals.visibleModalName = this.name;
  }

  @action close() {
    this.modals.closeAll();
  }

  hasFieldError(field: string) {
    return this.errorsByField.has(field);
  }

  fieldError(field: string) {
    //?.replace(/^.*has failed the validation:/, '').replace(' - ', '') || ''
    return this.errorsByField.get(field) || '';
  }

  /**
   * @deprecated
   */
  formGroupClassName(field: string) {
    return '';
    /*const errorClass = this.hasFieldError(field) ? ' has-error' : '';
    return `form-group${errorClass}`;*/
  }

  inBusy(cb: () => Promise<void>) {
    runInAction(() => this.busy = true);
    cb().then(() => {
      runInAction(() => {
        this.isError = false;
        this.errorText = '';
      });
    }).catch((err) => {
      runInAction(() => {
        this.isError = true;
        let message = 'Unknown error';
        if(err instanceof ApiValidationError) {
          message = this.root.i18n.t('base:validation-error');
          this.errorsByField.clear();
          for(const error of err.errors) {
            const prop = error.property;
            const current = this.errorsByField.get(prop);
            if(current) {
              this.errorsByField.set(error.property, `${current}, ${error.toString()}`);
            } else {
              this.errorsByField.set(error.property, error.toString());
            }
          }
        } else if(typeof err.message === 'string') {
          message = err.message;
        } else if (Array.isArray(err.message)) {
          message = err.message.join(err);
        }
        this.errorText = message;
      });
    }).finally(() => this.busy = false);
  }
}

import { action, computed, makeObservable, observable } from 'mobx';
import { validateVariableName } from './validate-variable-name.js';

export interface INewVariableStoreParams {
  value?: string;
  /** Names already declared in the enclosing scope, read reactively for uniqueness checks. */
  getScopeNames: () => readonly string[];
  /** An empty value is valid (an optional result variable the user may leave blank). */
  allowEmpty?: boolean;
}

export class NewVariableStore {
  @observable value: string;
  private readonly getScopeNames: () => readonly string[];
  private readonly allowEmpty: boolean;

  constructor({ value, getScopeNames, allowEmpty }: INewVariableStoreParams) {
    this.value = value ?? '';
    this.getScopeNames = getScopeNames;
    this.allowEmpty = allowEmpty ?? false;
    makeObservable(this);
  }

  @action setValue(value: string): void {
    this.value = value;
  }

  @computed get error(): string | null {
    if (this.allowEmpty && this.value.trim() === '') return null;
    return validateVariableName(this.value, this.getScopeNames());
  }

  @computed get hasErrors(): boolean {
    return this.error !== null;
  }
}

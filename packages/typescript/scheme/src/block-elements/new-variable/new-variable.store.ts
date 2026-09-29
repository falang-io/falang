import { action, computed, makeObservable, observable } from 'mobx';
import { validateVariableName } from './validate-variable-name.js';

export interface INewVariableStoreParams {
  value?: string;
  /** Names already declared in the enclosing scope, read reactively for uniqueness checks. */
  getScopeNames: () => readonly string[];
}

export class NewVariableStore {
  @observable value: string;
  private readonly getScopeNames: () => readonly string[];

  constructor({ value, getScopeNames }: INewVariableStoreParams) {
    this.value = value ?? '';
    this.getScopeNames = getScopeNames;
    makeObservable(this);
  }

  @action setValue(value: string): void {
    this.value = value;
  }

  @computed get error(): string | null {
    return validateVariableName(this.value, this.getScopeNames());
  }

  @computed get hasErrors(): boolean {
    return this.error !== null;
  }
}

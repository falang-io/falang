import type { TVariableInfo } from '@falang/typescript-dto';
import { action, makeObservable, ObservableMap } from 'mobx';

export interface IFunctionRegistryParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

export interface IFunctionRegistryItem {
  readonly schemeId: string;
  readonly name: string;
  readonly parameters: readonly IFunctionRegistryParameter[];
  /** Absent (or `{ type: 'void' }`) means the function returns nothing — see `getFunctionSignature`
   * in `@falang/logic-constructor`, which treats a missing `returnValue` the same way. */
  readonly returnValue?: TVariableInfo;
}

/** Project-wide index of function signatures, keyed by `schemeId` (the document id a `call-function` node targets). */
export class FunctionsRegistryStore {
  readonly functions = new ObservableMap<string, IFunctionRegistryItem>();

  constructor() {
    makeObservable(this);
  }

  @action setFunction(item: IFunctionRegistryItem) {
    this.functions.set(item.schemeId, item);
  }

  @action removeFunction(schemeId: string) {
    this.functions.delete(schemeId);
  }

  dispose() {
    this.functions.clear();
  }
}

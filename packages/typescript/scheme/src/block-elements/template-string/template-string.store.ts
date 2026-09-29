import { computed, makeObservable } from 'mobx';
import { CodeModelStore } from '../code/code-model.store.js';
import { buildTemplateStringHiddenWrap } from '../../monaco/scope/build-template-string-hidden-wrap.js';

export interface ITemplateStringStoreParams {
  id: string;
  name?: string;
  value?: string;
  /** The enclosing scope's hidden declarations (see `ExpressionBlockEditorStore.hiddenScopeCode`), re-read on every change. */
  getScopeCode: () => string;
}

/**
 * A monaco-backed field for a plain string value that may contain `${expr}` interpolation —
 * wraps `CodeModelStore` with a hidden template-literal shell so monaco/tsc validates the
 * interpolations against the caller's scope, without exposing the wrapping backticks to the user.
 * Pairs with `TemplateStringViewComponent` for the read-only view. Any block field that stores
 * "a string, optionally with `${expr}`" (a log message, an HTTP URL, …) can reuse this instead of
 * wiring `CodeModelStore` + `buildTemplateStringHiddenWrap` by hand.
 */
export class TemplateStringStore {
  readonly codeStore: CodeModelStore;
  private readonly getScopeCode: () => string;

  constructor({ id, name, value, getScopeCode }: ITemplateStringStoreParams) {
    this.getScopeCode = getScopeCode;
    makeObservable(this);
    this.codeStore = new CodeModelStore({
      id,
      name,
      value,
      hiddenPrefix: this.hiddenPrefix,
      hiddenSuffix: this.hiddenSuffix,
    });
  }

  @computed private get wrap() {
    return buildTemplateStringHiddenWrap(this.getScopeCode());
  }

  get hiddenPrefix(): string {
    return this.wrap.hiddenPrefix;
  }

  get hiddenSuffix(): string {
    return this.wrap.hiddenSuffix;
  }

  get value(): string {
    return this.codeStore.value;
  }

  dispose(): void {
    this.codeStore.dispose();
  }
}

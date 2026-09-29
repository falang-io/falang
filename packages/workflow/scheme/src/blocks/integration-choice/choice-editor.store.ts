import { resolveService } from '@falang/di';
import { TOKEN_SCHEME, type IBlockEditorFactoryParams } from '@falang/scheme';
import {
  CodeModelStore,
  collectScopeVariables,
  ExpressionBlockEditorStore,
  NewVariableStore,
  TemplateStringStore,
} from '@falang/typescript-scheme';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  getChoiceHeaderFields,
  type IChoiceOptionData,
  type IFieldConfig,
  type IChoiceDescriptor,
  type IIntegrationInstance,
  type TChoiceHeaderData,
} from '@falang/workflow-integrations-common';
import { action, makeObservable, observable, runInAction } from 'mobx';
import {
  TOKEN_CREDENTIALS_PROVIDER,
  TOKEN_FIELD_OPTIONS_PROVIDER,
  TOKEN_INTEGRATIONS_REGISTRY,
  type IFieldOptionsProvider,
} from '../../registry/di-tokens.js';
import { syncIndexedChildren } from '../sync-indexed-children.js';

export interface ISelectOption {
  readonly value: string;
  readonly label: string;
}

/** A choice always has at least one option — zero would compile to a `switch` with no cases and an empty `anyOf` schema. */
const MIN_OPTIONS = 1;

const DEFAULT_OPTION_DATA_TYPE: TVariableInfo = { type: 'string' };
const DEFAULT_VARIABLE_NAME = 'data';

/** The 3 scalar types `choice-emitters.ts` (compiler) currently supports — see `IChoiceDescriptor`'s doc. */
export const DATA_TYPE_OPTIONS: readonly ISelectOption[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
];

const dataTypeToSelectValue = (type: TVariableInfo): string =>
  type.type === 'number' || type.type === 'boolean' ? type.type : 'string';

const selectValueToDataType = (value: string): TVariableInfo => {
  if (value === 'number') return { type: 'number', numberType: { type: 'any' } };
  if (value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
};

/**
 * Backs `call-ai-choice`-shaped nodes (any vendor's `IChoiceDescriptor`) — always opened as a
 * sidebar, never inline, since it edits both the header's own fields AND the alias+dataType option
 * list that drives its `<name>-option` children. Mirrors `QuestionEditorStore` closely (same
 * `contextFields`/monaco-field handling, same `syncIndexedChildren`-based child sync) — differs only
 * in the option payload shape (`{alias, dataType, variable}` instead of a bare label).
 */
export class ChoiceEditorStore extends ExpressionBlockEditorStore<TChoiceHeaderData> {
  readonly descriptor: IChoiceDescriptor;
  readonly values = observable.map<string, string>();
  readonly codeStores = new Map<string, CodeModelStore>();
  readonly templateStringStores = new Map<string, TemplateStringStore>();
  @observable.shallow options: IChoiceOptionData[] = [];
  @observable.shallow dynamicOptions: readonly ISelectOption[] = [];
  @observable optionsLoading = false;
  /**
   * ONE identifier for the whole node, not per option — every branch is a mutually-exclusive
   * `switch` case, so there's no reason to name them differently. Stamped onto every option's
   * `data.variable` on save (see `getData`) purely so `getContainerScopeContribution`
   * (`@falang/typescript-common`) can read it off the option node alone, without a second lookup
   * on its parent header.
   */
  readonly variableStore: NewVariableStore;
  private readonly credentialInstances: readonly IIntegrationInstance[];
  private readonly iconId: string;
  private readonly fieldOptionsProvider: IFieldOptionsProvider;
  private readonly credentialRefFieldName: string | undefined;
  private readonly dynamicOptionsField: IFieldConfig | undefined;

  constructor(params: IBlockEditorFactoryParams<TChoiceHeaderData>) {
    super(params);
    makeObservable(this);
    this.iconId = params.icon.id;
    const registry = resolveService(TOKEN_INTEGRATIONS_REGISTRY, params.container);
    const descriptor = registry.findChoice(params.icon.name);
    if (!descriptor) throw new Error(`No integration choice registered for node "${params.icon.name}"`);
    this.descriptor = descriptor;
    this.credentialInstances = resolveService(TOKEN_CREDENTIALS_PROVIDER, params.container).getInstances();
    this.fieldOptionsProvider = resolveService(TOKEN_FIELD_OPTIONS_PROVIDER, params.container);
    this.options = [...(params.data.options ?? [])];
    this.variableStore = new NewVariableStore({
      value: this.options[0]?.variable ?? DEFAULT_VARIABLE_NAME,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });

    const headerFields = getChoiceHeaderFields(descriptor);
    this.credentialRefFieldName = headerFields.find((field) => field.kind === 'credential-ref')?.name;
    this.dynamicOptionsField = headerFields.find((field) => field.kind === 'select' && field.loadOptions);

    for (const field of headerFields) {
      const value = (params.data[field.name] as string | undefined) ?? '';
      if (field.kind === 'expression') {
        this.codeStores.set(
          field.name,
          new CodeModelStore({
            id: params.icon.id,
            name: field.name,
            value,
            hiddenPrefix: this.getExpressionHiddenPrefix(field),
          }),
        );
      } else if (field.kind === 'template-string') {
        this.templateStringStores.set(
          field.name,
          new TemplateStringStore({
            id: params.icon.id,
            name: field.name,
            value,
            getScopeCode: () => this.hiddenScopeCode,
          }),
        );
      } else {
        this.values.set(field.name, value);
      }
    }

    if (this.dynamicOptionsField) this.refreshDynamicOptions();
  }

  /**
   * Same rule `IntegrationActionEditorStore`/`QuestionEditorStore` use: force-type an expression field
   * when `expectedType` is set, else the bare enclosing scope. Neither choices nor questions actually
   * declare a function `expectedType` today (only `IntegrationActionEditorStore`'s generic
   * "call vendor API" action does) — resolved here too only so the field's type stays a plain
   * `TVariableInfo` for `buildHiddenPrefixForType`, not because this store re-derives it on change.
   */
  getExpressionHiddenPrefix(field: IFieldConfig): string {
    if (!field.expectedType) return this.hiddenScopeCode;
    const resolvedType =
      typeof field.expectedType === 'function'
        ? field.expectedType(Object.fromEntries(this.values))
        : field.expectedType;
    return resolvedType ? this.buildHiddenPrefixForType(resolvedType) : this.hiddenScopeCode;
  }

  @action setFieldValue(name: string, value: string): void {
    this.values.set(name, value);
    // Switching which credential is selected invalidates any previously loaded options — the new
    // provider/account may not offer the same choices. Same rule `IntegrationActionEditorStore` uses.
    if (name === this.credentialRefFieldName && this.dynamicOptionsField) {
      this.values.set(this.dynamicOptionsField.name, '');
      this.refreshDynamicOptions();
    }
  }

  /** Never rejects (all failure paths are caught internally) — safe to call without awaiting. */
  private async refreshDynamicOptions(): Promise<void> {
    const field = this.dynamicOptionsField;
    const credentialId = this.credentialRefFieldName ? (this.values.get(this.credentialRefFieldName) ?? '') : '';
    if (!field || !credentialId) {
      runInAction(() => {
        this.dynamicOptions = [];
      });
      return;
    }
    runInAction(() => {
      this.optionsLoading = true;
    });
    try {
      const loadedOptions = await this.fieldOptionsProvider.loadOptions(
        field.vendor ?? '',
        credentialId,
        this.descriptor.name,
        field.name,
      );
      const options = [...loadedOptions].toSorted((a, b) => a.label.localeCompare(b.label));
      runInAction(() => {
        this.dynamicOptions = options;
      });
    } catch {
      runInAction(() => {
        this.dynamicOptions = [];
      });
    } finally {
      runInAction(() => {
        this.optionsLoading = false;
      });
    }
  }

  getFieldOptions(field: IFieldConfig): readonly ISelectOption[] {
    if (field.kind === 'credential-ref') {
      return this.credentialInstances
        .filter((instance) => instance.vendor === field.vendor)
        .map((instance) => ({ value: instance.id, label: instance.name }));
    }
    if (field.kind === 'select' && field.loadOptions) {
      return this.dynamicOptions;
    }
    return field.options ?? [];
  }

  getOptionDataTypeSelectValue(index: number): string {
    return dataTypeToSelectValue(this.options[index].dataType);
  }

  @action addOption(): void {
    this.options.push({
      alias: `Option ${this.options.length + 1}`,
      dataType: DEFAULT_OPTION_DATA_TYPE,
      variable: this.variableStore.value,
    });
  }

  @action setOptionAlias(index: number, alias: string): void {
    this.options[index] = { ...this.options[index], alias };
  }

  @action setOptionDataType(index: number, selectValue: string): void {
    this.options[index] = { ...this.options[index], dataType: selectValueToDataType(selectValue) };
  }

  /**
   * Only the LAST row can be removed (no arbitrary mid-list delete/reorder) — same reasoning as
   * `QuestionEditorStore.removeLastOption`: an option node's children (its downstream branch) travel
   * with that node regardless of `data`, so a free-form reorder/mid-delete would need identity-based
   * diffing to avoid silently reassigning one option's branch to a different alias.
   */
  @action removeLastOption(): void {
    if (this.options.length > MIN_OPTIONS) this.options.pop();
  }

  getData(): TChoiceHeaderData {
    const data: Record<string, string> = Object.fromEntries(this.values);
    this.codeStores.forEach((store, name) => {
      data[name] = store.value;
    });
    this.templateStringStores.forEach((store, name) => {
      data[name] = store.value;
    });
    // Every option gets the same variable name, regardless of what was in `this.options` before —
    // see `variableStore`'s doc for why this denormalization exists.
    const variable = this.variableStore.value;
    const options = this.options.map((option) => ({ ...option, variable }));
    // Runs once, only on save — see `syncIndexedChildren`'s doc for why this is a safe place for the
    // one-time child-sync side effect.
    const scheme = resolveService(TOKEN_SCHEME, this.container);
    syncIndexedChildren(
      scheme,
      this.iconId,
      `${this.descriptor.name}-option`,
      options,
      (option): IChoiceOptionData => option,
    );
    return { ...data, options } as TChoiceHeaderData;
  }

  override dispose(): void {
    this.codeStores.forEach((store) => store.dispose());
    this.templateStringStores.forEach((store) => store.dispose());
  }
}

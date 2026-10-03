import { resolveService } from '@falang/di';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { ITypeRegistryObjectItem } from '@falang/typescript-scheme';
import {
  CodeModelStore,
  collectScopeVariables,
  ExpressionBlockEditorStore,
  NewVariableStore,
  TemplateStringStore,
} from '@falang/typescript-scheme';
import type { IActionDescriptor, IFieldConfig, IIntegrationInstance } from '@falang/workflow-integrations-common';
import { action, makeObservable, observable, runInAction } from 'mobx';
import {
  TOKEN_CREDENTIALS_PROVIDER,
  TOKEN_FIELD_OPTIONS_PROVIDER,
  TOKEN_INTEGRATIONS_REGISTRY,
  type IFieldOptionsProvider,
} from '../../registry/di-tokens.js';
import { initialFieldValue } from '../../registry/initial-field-value.js';

export type TIntegrationActionData = Readonly<Record<string, string>>;

export interface ISelectOption {
  readonly value: string;
  readonly label: string;
}

/** The restricted `TVariableInfo` a `result-type` field's value JSON-encodes — see ADR 0006/`call-ai-text`. */
export type TResultInfo = { type: 'string' } | { type: 'struct'; id: string };

const parseResultInfo = (raw: string | undefined): TResultInfo => {
  if (!raw) return { type: 'string' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) return parsed as TResultInfo;
  } catch {
    // fall through to the text default below
  }
  return { type: 'string' };
};

/**
 * One editor store for every action node of every vendor — the field list comes from the node's own
 * `IActionDescriptor` (looked up by node name in the registry), not from a per-node subclass. See
 * ADR 0006's "generic field-driven UI" section.
 *
 * `expression`-kind fields get a real monaco `CodeModelStore`, scope-typed via the inherited
 * `ExpressionBlockEditorStore.hiddenScopeCode` (or forced to `field.expectedType` when set, see
 * `getExpressionHiddenPrefix`) — the same mechanism `@falang/typescript-scheme`'s `action`/
 * `arr-op-input` blocks use, so e.g. a trigger's bound payload (`message`) autocompletes inside a
 * `telegram-send-message` node's `chatId` field. `template-string`-kind fields (e.g. that same node's
 * `text`) get a `TemplateStringStore` instead — hidden backtick wrap, so the user never types
 * surrounding quotes, same as `@falang/typescript-scheme`'s `log` block. Every other kind (`text`/
 * `select`/`credential-ref`) stays a plain string, rendered via `TsSelect`/a text input by the component.
 */
export class IntegrationActionEditorStore extends ExpressionBlockEditorStore<TIntegrationActionData> {
  readonly action: IActionDescriptor;
  /** See `@falang/scheme`'s `EditorType.configurable`/`resolveEditorType` — read by the core editor shell. */
  readonly editorType: 'inline' | 'sidebar';
  readonly values = observable.map<string, string>();
  readonly codeStores = new Map<string, CodeModelStore>();
  readonly templateStringStores = new Map<string, TemplateStringStore>();
  readonly newVariableStores = new Map<string, NewVariableStore>();
  @observable.shallow dynamicOptions: readonly ISelectOption[] = [];
  @observable optionsLoading = false;
  private readonly credentialInstances: readonly IIntegrationInstance[];
  private readonly fieldOptionsProvider: IFieldOptionsProvider;
  private readonly credentialRefFieldName: string | undefined;
  private readonly dynamicOptionsField: IFieldConfig | undefined;

  constructor(params: IBlockEditorFactoryParams<TIntegrationActionData>) {
    super(params);
    makeObservable(this);
    const registry = resolveService(TOKEN_INTEGRATIONS_REGISTRY, params.container);
    const descriptor = registry.findAction(params.icon.name);
    if (!descriptor) throw new Error(`No integration action registered for node "${params.icon.name}"`);
    this.action = descriptor;
    this.editorType = descriptor.editorType ?? 'inline';
    this.credentialInstances = resolveService(TOKEN_CREDENTIALS_PROVIDER, params.container).getInstances();
    this.fieldOptionsProvider = resolveService(TOKEN_FIELD_OPTIONS_PROVIDER, params.container);
    this.credentialRefFieldName = descriptor.fields.find((field) => field.kind === 'credential-ref')?.name;
    this.dynamicOptionsField = descriptor.fields.find((field) => field.kind === 'select' && field.loadOptions);

    for (const field of descriptor.fields) {
      const value = initialFieldValue(field, params.data[field.name], this.credentialInstances);
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
      } else if (field.kind === 'new-variable') {
        this.newVariableStores.set(
          field.name,
          new NewVariableStore({
            value,
            getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
          }),
        );
      } else {
        this.values.set(field.name, value);
      }
    }

    if (this.dynamicOptionsField) this.refreshDynamicOptions();
  }

  /**
   * `kind: 'expression'` fields with no `expectedType` just get the bare enclosing scope (any TS
   * expression type-checks); fields that declare `expectedType` are forced to type-check against it —
   * same `let _value: T =` mechanism `arr-op-input`/`arr-insert` use, inherited from
   * `ExpressionBlockEditorStore.buildHiddenPrefixForType`. A function `expectedType` is invoked with
   * the action's current field values (e.g. a `method` select's chosen value) — see `IFieldConfig`'s
   * own doc comment.
   */
  getExpressionHiddenPrefix(field: IFieldConfig): string {
    if (!field.expectedType) return this.hiddenScopeCode;
    const resolvedType =
      typeof field.expectedType === 'function' ? field.expectedType(this.getFieldValuesSnapshot()) : field.expectedType;
    return resolvedType ? this.buildHiddenPrefixForType(resolvedType) : this.hiddenScopeCode;
  }

  /** Plain-string snapshot of every field's current value — `expression`/`template-string`/`new-variable` fields live in their own stores, not `this.values`, so a function `expectedType` needs all three merged in. */
  private getFieldValuesSnapshot(): Readonly<Record<string, string>> {
    const snapshot: Record<string, string> = Object.fromEntries(this.values);
    this.codeStores.forEach((store, name) => {
      snapshot[name] = store.value;
    });
    this.templateStringStores.forEach((store, name) => {
      snapshot[name] = store.value;
    });
    this.newVariableStores.forEach((store, name) => {
      snapshot[name] = store.value;
    });
    return snapshot;
  }

  @action setFieldValue(name: string, value: string): void {
    this.values.set(name, value);
    // Switching which credential is selected invalidates any previously loaded options — the new
    // provider/account may not offer the same choices.
    if (name === this.credentialRefFieldName && this.dynamicOptionsField) {
      this.values.set(this.dynamicOptionsField.name, '');
      this.refreshDynamicOptions();
    }
    this.refreshDynamicExpressionTypes();
  }

  /**
   * Re-derives the hidden-prefix of every `expression` field whose `expectedType` is a function of
   * sibling field values — e.g. a generic "call vendor API" action's `data` field, retyped whenever
   * the `method` select changes. Recomputes unconditionally on every field-value change rather than
   * tracking which field a given `expectedType` function actually reads — same "cheap, so don't
   * bother being clever" call `refreshDynamicOptions` already makes, safe since an action has only a
   * handful of fields.
   */
  private refreshDynamicExpressionTypes(): void {
    for (const field of this.action.fields) {
      if (field.kind !== 'expression' || typeof field.expectedType !== 'function') continue;
      this.codeStores.get(field.name)?.setHiddenPrefix(this.getExpressionHiddenPrefix(field));
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
        this.action.name,
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

  /** Options for a `select`/`credential-ref` field's `TsSelect`. */
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

  /** Parses a `result-type` field's JSON-encoded value — defaults to plain text on empty/invalid input. */
  getResultInfo(field: IFieldConfig): TResultInfo {
    return parseResultInfo(this.values.get(field.name));
  }

  @action setResultMode(field: IFieldConfig, mode: TResultInfo['type']): void {
    this.setFieldValue(field.name, JSON.stringify(mode === 'struct' ? { type: 'struct', id: '' } : { type: 'string' }));
  }

  @action setResultStructId(field: IFieldConfig, id: string): void {
    this.setFieldValue(field.name, JSON.stringify({ type: 'struct', id }));
  }

  /** Project structs a `result-type` field can point at for "structured output" — same source `function-body`'s sidebar editor lists. */
  get structTypes(): readonly ITypeRegistryObjectItem[] {
    return this.projectService ? [...this.projectService.typesRegistry.types.values()] : [];
  }

  getData(): TIntegrationActionData {
    const data: Record<string, string> = Object.fromEntries(this.values);
    this.codeStores.forEach((store, name) => {
      data[name] = store.value;
    });
    this.templateStringStores.forEach((store, name) => {
      data[name] = store.value;
    });
    this.newVariableStores.forEach((store, name) => {
      data[name] = store.value;
    });
    return data;
  }

  override dispose(): void {
    this.codeStores.forEach((store) => store.dispose());
    this.templateStringStores.forEach((store) => store.dispose());
  }
}

import { resolveService } from '@falang/di';
import { TOKEN_SCHEME, type IBlockEditorFactoryParams } from '@falang/scheme';
import { CodeModelStore, ExpressionBlockEditorStore, TemplateStringStore } from '@falang/typescript-scheme';
import {
  getQuestionHeaderFields,
  TIMEOUT_OPTION_LABEL,
  type IFieldConfig,
  type IIntegrationInstance,
  type IQuestionDescriptor,
  type IQuestionOptionData,
  type IQuestionOptionDataWithType,
  type TQuestionHeaderData,
  type TTaskOptionDataType,
} from '@falang/workflow-integrations-common';
import { action, makeObservable, observable } from 'mobx';
import { TOKEN_CREDENTIALS_PROVIDER, TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';
import { syncIndexedChildren } from '../sync-indexed-children.js';

export interface ISelectOption {
  readonly value: string;
  readonly label: string;
}

/** A question always has at least one button — zero would compile to a `switch` with no cases at all. */
const MIN_OPTIONS = 1;
const DEFAULT_OPTION_DATA_TYPE: TTaskOptionDataType = 'void';

/** The 4 option data types a question with `optionDataTypes` may declare — unlike `ChoiceEditorStore`'s `DATA_TYPE_OPTIONS`, `'void'` (a bare button, no resolver-supplied value) is a real, common choice here. */
export const QUESTION_OPTION_DATA_TYPE_OPTIONS: readonly ISelectOption[] = [
  { value: 'void', label: 'None' },
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
];

/** Per-row `dataType`/`prompt`, only populated (and only rendered) when `descriptor.optionDataTypes` is set — see `IQuestionDescriptorExtensions.optionDataTypes`. Kept parallel to (indexed the same as) `options`, not merged into one array, so every other field/method that only cares about labels (`getData`'s header `options: readonly string[]`, `addOption`/`removeLastOption`'s length checks) stays unchanged from before this feature existed. */
interface IOptionMeta {
  dataType: TTaskOptionDataType;
  prompt?: string;
}

/**
 * Backs `telegram-question`-shaped nodes (any vendor's `IQuestionDescriptor`) — always opened as a
 * sidebar (see `questionHeaderBlockConfig`), never inline, since it edits both the header's own
 * fields AND the button-options list that drives its `<name>-option` children.
 *
 * `contextFields`/`questionFields` (see `IQuestionDescriptor`) get the same monaco/template-string
 * treatment `IntegrationActionEditorStore` gives `IActionDescriptor.fields` — reused here via the
 * same `ExpressionBlockEditorStore` base for `hiddenScopeCode`/`buildHiddenPrefixForType`.
 *
 * Two extensions (ADR 0040 (private) §4): with `optionDataTypes`, each
 * row in `options` gets a parallel `optionMeta` entry (`dataType`/`prompt`, see `IOptionMeta`) synced
 * onto the option node's own `data` alongside its label — mirrors `ChoiceEditorStore`'s alias+dataType
 * rows. With `timeoutField`, one extra, fixed (`data.fixed: true`) option always exists at the tail
 * of this node's children beyond whatever `options`/`optionMeta` list — never surfaced in `options`
 * (so it's never shown/editable/deletable via `addOption`/`setOptionLabel`/`removeLastOption`, which
 * only ever see the real buttons) and always re-appended at the tail by `getData`'s
 * `syncIndexedChildren` call, regardless of how the real options list above it grows or shrinks.
 */
export class QuestionEditorStore extends ExpressionBlockEditorStore<TQuestionHeaderData> {
  readonly descriptor: IQuestionDescriptor;
  readonly values = observable.map<string, string>();
  readonly codeStores = new Map<string, CodeModelStore>();
  readonly templateStringStores = new Map<string, TemplateStringStore>();
  @observable.shallow options: string[] = [];
  @observable.shallow optionMeta: IOptionMeta[] = [];
  private readonly credentialInstances: readonly IIntegrationInstance[];
  private readonly iconId: string;

  constructor(params: IBlockEditorFactoryParams<TQuestionHeaderData>) {
    super(params);
    makeObservable(this);
    this.iconId = params.icon.id;
    const registry = resolveService(TOKEN_INTEGRATIONS_REGISTRY, params.container);
    const descriptor = registry.findQuestion(params.icon.name);
    if (!descriptor) throw new Error(`No integration question registered for node "${params.icon.name}"`);
    this.descriptor = descriptor;
    this.credentialInstances = resolveService(TOKEN_CREDENTIALS_PROVIDER, params.container).getInstances();
    this.options = [...(params.data.options ?? [])];
    if (descriptor.optionDataTypes) {
      // The header's own `data.options` is bare labels only (what the ask activity sends as button
      // text) — `dataType`/`prompt` live on the `<name>-option` children themselves, read here from
      // the live tree (`this.dataNode.children`, a `NodeStore[]`) rather than `params.data`. Matched
      // by *index* among the non-`fixed` children, same "options[i] is the i-th real child" invariant
      // `getData`'s `syncIndexedChildren` call relies on and re-establishes on every save.
      const realChildrenData = this.dataNode.children
        .map((child) => child.data as Partial<IQuestionOptionDataWithType> | null)
        .filter((childData): childData is IQuestionOptionDataWithType => Boolean(childData) && !childData?.fixed);
      this.optionMeta = this.options.map((_label, index) => ({
        dataType: realChildrenData[index]?.dataType ?? DEFAULT_OPTION_DATA_TYPE,
        prompt: realChildrenData[index]?.prompt,
      }));
    }

    for (const field of getQuestionHeaderFields(descriptor)) {
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
  }

  /**
   * Same rule `IntegrationActionEditorStore` uses: force-type an expression field when `expectedType`
   * is set, else the bare enclosing scope. Questions don't actually declare a function `expectedType`
   * today (only `IntegrationActionEditorStore`'s generic "call vendor API" action does) — resolved
   * here too only so the field's type stays a plain `TVariableInfo`, not because this store re-derives
   * it on change.
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
  }

  getFieldOptions(field: IFieldConfig): readonly ISelectOption[] {
    if (field.kind === 'credential-ref') {
      return this.credentialInstances
        .filter((instance) => instance.vendor === field.vendor)
        .map((instance) => ({ value: instance.id, label: instance.name }));
    }
    return field.options ?? [];
  }

  @action addOption(): void {
    this.options.push(`Вариант ${this.options.length + 1}`);
    if (this.descriptor.optionDataTypes) this.optionMeta.push({ dataType: DEFAULT_OPTION_DATA_TYPE });
  }

  @action setOptionLabel(index: number, value: string): void {
    this.options[index] = value;
  }

  @action setOptionDataType(index: number, dataType: TTaskOptionDataType): void {
    this.optionMeta[index] = { ...this.optionMeta[index], dataType };
  }

  @action setOptionPrompt(index: number, prompt: string): void {
    this.optionMeta[index] = { ...this.optionMeta[index], prompt };
  }

  /**
   * Only the LAST row can be removed (no arbitrary mid-list delete/reorder) — an option node's
   * children (its downstream branch) travel with that node regardless of label text, so a free-form
   * reorder/mid-delete would need identity-based diffing to avoid silently reassigning one option's
   * branch to a different button. Append/truncate-at-tail plus in-place rename (see `setOptionLabel`)
   * never has that problem. See `syncIndexedChildren` (`../sync-indexed-children.js`) for the matching sync logic.
   */
  @action removeLastOption(): void {
    if (this.options.length > MIN_OPTIONS) {
      this.options.pop();
      this.optionMeta.pop();
    }
  }

  private buildOptionData(label: string, meta?: IOptionMeta): IQuestionOptionData | IQuestionOptionDataWithType {
    if (!this.descriptor.optionDataTypes) return { label } satisfies IQuestionOptionData;
    const dataType = meta?.dataType ?? DEFAULT_OPTION_DATA_TYPE;
    return { label, dataType, ...(meta?.prompt ? { prompt: meta.prompt } : {}) } satisfies IQuestionOptionDataWithType;
  }

  getData(): TQuestionHeaderData {
    const data: Record<string, string> = Object.fromEntries(this.values);
    this.codeStores.forEach((store, name) => {
      data[name] = store.value;
    });
    this.templateStringStores.forEach((store, name) => {
      data[name] = store.value;
    });
    const options = [...this.options];
    const items: (IQuestionOptionData | IQuestionOptionDataWithType)[] = options.map((label, index) =>
      this.buildOptionData(label, this.optionMeta[index]),
    );
    // The automatic timeout branch is never part of `options` (never shown/editable), but always
    // re-appended here at the tail — see this class's own doc comment — so `syncIndexedChildren`
    // never mistakes it for a removed real option and deletes it, regardless of how `options` itself
    // grows or shrinks.
    if (this.descriptor.timeoutField) {
      items.push({ ...this.buildOptionData(TIMEOUT_OPTION_LABEL), fixed: true });
    }
    // Runs once, only on save — see `syncIndexedChildren`'s doc for why this is a safe place for the
    // one-time child-sync side effect (`EditorService.stopEdit` only calls `getData()` when the
    // sidebar's save actually commits, before disposing this store).
    const scheme = resolveService(TOKEN_SCHEME, this.container);
    syncIndexedChildren(scheme, this.iconId, `${this.descriptor.name}-option`, items, (item) => item);
    return { ...data, options } as TQuestionHeaderData;
  }

  override dispose(): void {
    this.codeStores.forEach((store) => store.dispose());
    this.templateStringStores.forEach((store) => store.dispose());
  }
}

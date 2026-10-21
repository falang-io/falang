import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { createVarDto, variableInfoZod } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable, reaction } from 'mobx';
import { buildDefaultVariableType } from '../../block-elements/variable-type/variable-type-model.js';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { TemplateStringStore } from '../../block-elements/template-string/template-string.store.js';
import {
  expressionToTextValue,
  textValueToExpression,
} from '../../block-elements/template-string/string-value-expression.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { createVarValuePrefix } from '../../field-check/prefix-builders.js';

export type ICreateVar = zod.infer<typeof createVarDto>;
type IVariableType = zod.infer<typeof variableInfoZod>;

/**
 * Editor for `create-var`. A `string` variable's initial value is edited as text with `${expr}`
 * interpolations (as `arr-push` into an array of strings does) and stored back as a string/template
 * literal expression; any other type keeps the plain expression field. Changing the type converts
 * the value between the two forms.
 */
export class CreateVarBlockEditorStore extends ExpressionBlockEditorStore<ICreateVar> {
  @observable data: ICreateVar;
  readonly valueCodeStore: CodeModelStore;
  @observable.ref valueTextStore: TemplateStringStore | null = null;
  private readonly iconId: string;
  private readonly disposeTypeReaction: () => void;

  constructor(params: IBlockEditorFactoryParams<ICreateVar>) {
    super(params);
    this.data = params.data;
    this.valueCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'value',
      value: params.data.value ?? '',
      hiddenPrefix: this.valueHiddenPrefix,
      allowEmpty: true,
    });
    this.iconId = params.icon.id;
    makeObservable(this);
    this.disposeTypeReaction = reaction(
      () => this.isStringType,
      (isString) => (isString ? this.switchToText() : this.switchToExpression()),
      { fireImmediately: true },
    );
  }

  @computed get isStringType(): boolean {
    return this.data.variableType.type === 'string';
  }

  @action private switchToText(): void {
    if (this.valueTextStore) return;
    this.valueTextStore = new TemplateStringStore({
      id: this.iconId,
      name: 'value-text',
      value: expressionToTextValue(this.valueCodeStore.value),
      getScopeCode: () => this.hiddenScopeCode,
    });
  }

  @action private switchToExpression(): void {
    const textStore = this.valueTextStore;
    if (!textStore) return;
    this.valueCodeStore.setValue(textStore.value === '' ? '' : textValueToExpression(textStore.value));
    this.valueTextStore = null;
    textStore.dispose();
  }

  /** The value as it is stored: an empty text means "no initial value" (the type's default, `''`). */
  get valueExpression(): string {
    if (!this.valueTextStore) return this.valueCodeStore.value.trim();
    const text = this.valueTextStore.value;
    return text === '' ? '' : textValueToExpression(text);
  }

  get typePickerProjectService() {
    return this.projectService;
  }

  get structTypes() {
    return this.projectService ? [...this.projectService.typesRegistry.types.values()] : [];
  }

  /** Types the value field's editor as the variable's own declared type, e.g. `let x: string = ` for `x`. */
  @computed get valueHiddenPrefix(): string {
    return createVarValuePrefix(this.hiddenScopeCode, this.data.variableType);
  }

  getData(): ICreateVar {
    const value = this.valueExpression;
    if (value === '') {
      // oxlint-disable-next-line no-undefined -- clears a previously-set value back to "omitted"
      return { ...this.data, value: undefined };
    }
    return { ...this.data, value };
  }

  @action setName(name: string) {
    this.data = { ...this.data, name };
  }

  @action setVariableType(variableType: IVariableType) {
    this.data = { ...this.data, variableType };
  }

  @action setType(type: IVariableType['type']) {
    this.data = { ...this.data, variableType: buildDefaultVariableType(type, this.projectService) };
  }

  @action setArrayElementType(type: IVariableType['type']) {
    if (this.data.variableType.type !== 'array') return;
    const current = this.data.variableType;
    this.data = {
      ...this.data,
      variableType: { ...current, elementType: buildDefaultVariableType(type, this.projectService) },
    };
  }

  @action setArrayElementStructId(id: string) {
    if (this.data.variableType.type !== 'array') return;
    if (this.data.variableType.elementType.type !== 'struct') return;
    const current = this.data.variableType;
    this.data = {
      ...this.data,
      variableType: { ...current, elementType: { type: 'struct', id } },
    };
  }

  @action setArrayDimensions(dimensions: number) {
    if (this.data.variableType.type !== 'array') return;
    const current = this.data.variableType;
    this.data = {
      ...this.data,
      variableType: { ...current, dimensions },
    };
  }

  @action setStructId(id: string) {
    if (this.data.variableType.type !== 'struct') return;
    this.data = {
      ...this.data,
      variableType: { type: 'struct', id },
    };
  }

  override dispose() {
    this.disposeTypeReaction();
    this.valueCodeStore.dispose();
    this.valueTextStore?.dispose();
  }
}

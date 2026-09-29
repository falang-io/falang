import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { createVarDto, variableInfoZod } from '@falang/typescript-dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable } from 'mobx';
import { defaultVariableType } from '../object-property/object-property-editor.store.js';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { buildTypedValueHiddenPrefix } from '../../monaco/scope/typed-value-hidden-prefix.js';

export type ICreateVar = zod.infer<typeof createVarDto>;
type IVariableType = zod.infer<typeof variableInfoZod>;

export class CreateVarBlockEditorStore extends ExpressionBlockEditorStore<ICreateVar> {
  @observable data: ICreateVar;
  readonly valueCodeStore: CodeModelStore;

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
    makeObservable(this);
  }

  get structTypes() {
    return this.projectService ? [...this.projectService.typesRegistry.types.values()] : [];
  }

  /** Types the value field's editor as the variable's own declared type, e.g. `let x: string = ` for `x`. */
  @computed get valueHiddenPrefix(): string {
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode, variableInfoToTsType(this.data.variableType));
  }

  getData(): ICreateVar {
    const value = this.valueCodeStore.value.trim();
    if (value === '') {
      // oxlint-disable-next-line no-undefined -- clears a previously-set value back to "omitted"
      return { ...this.data, value: undefined };
    }
    return { ...this.data, value };
  }

  @action setName(name: string) {
    this.data = { ...this.data, name };
  }

  @action setType(type: IVariableType['type']) {
    this.data = { ...this.data, variableType: defaultVariableType(type) };
  }

  @action setArrayElementType(type: IVariableType['type']) {
    if (this.data.variableType.type !== 'array') return;
    const current = this.data.variableType;
    this.data = {
      ...this.data,
      variableType: { ...current, elementType: defaultVariableType(type) },
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
    this.valueCodeStore.dispose();
  }
}

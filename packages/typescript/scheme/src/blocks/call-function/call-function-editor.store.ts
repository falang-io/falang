import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { callFunctionDto } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable } from 'mobx';
import {
  DynamicTypedFieldsStore,
  type ITypedFieldDescriptor,
} from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import type { IFunctionRegistryItem } from '../../typescript-project-service/functions-registry.store.js';

export type ICallFunction = zod.infer<typeof callFunctionDto>;

export class CallFunctionBlockEditorStore extends ExpressionBlockEditorStore<ICallFunction> {
  @observable data: ICallFunction;
  readonly parameters: DynamicTypedFieldsStore;

  constructor(params: IBlockEditorFactoryParams<ICallFunction>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
    this.parameters = new DynamicTypedFieldsStore({
      id: params.icon.id,
      getFields: () => this.parameterDescriptors,
      initialValues: params.data.parameters,
      buildHiddenPrefix: (type) => this.buildHiddenPrefixForType(type),
    });
  }

  /** Every function known to the project, for the "scheme" picker. */
  @computed get availableFunctions(): readonly IFunctionRegistryItem[] {
    return Array.from(this.projectService?.functionsRegistry.functions.values() ?? []);
  }

  @computed private get targetFunction(): IFunctionRegistryItem | undefined {
    return this.projectService?.functionsRegistry.functions.get(this.data.schemeId);
  }

  /** Whether the targeted function declares a non-`void` return type — a `call-function` icon only
   * shows the "result" field when there's actually something to assign it to (see
   * `@falang/logic-constructor`'s `emitCallFunction`, which throws if `returnVariable` is set but the
   * target returns void). No target selected yet defaults to `false` (nothing to show either). */
  @computed get targetReturnsValue(): boolean {
    const returnValue = this.targetFunction?.returnValue;
    if (!returnValue || returnValue.type === 'void') return false;
    return true;
  }

  @computed private get parameterDescriptors(): readonly ITypedFieldDescriptor[] {
    return (this.targetFunction?.parameters ?? []).map((parameter) => ({
      key: parameter.name,
      label: parameter.name,
      type: parameter.type,
    }));
  }

  /** Strips a stale `returnVariable` for a void (or unresolved) target — `emitCallFunction` throws if
   * it's set but the target returns void (see `targetReturnsValue`), and the "result" field is hidden
   * in that case with nothing left to clear it through. */
  getData(): ICallFunction {
    return {
      ...this.data,
      parameters: [...this.parameters.getValues()],
      returnVariable: this.targetReturnsValue ? this.data.returnVariable : '',
    };
  }

  @action setSchemeId(schemeId: string) {
    this.data = { ...this.data, schemeId };
  }

  @action setReturnVariable(returnVariable: string) {
    this.data = { ...this.data, returnVariable };
  }

  override dispose() {
    this.parameters.dispose();
  }
}

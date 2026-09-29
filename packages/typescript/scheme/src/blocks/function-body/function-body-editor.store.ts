import { resolveService } from '@falang/di';
import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { functionBodyDto, functionBodyParameterZod, variableInfoZod } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypescriptProjectService } from '../../typescript-project-service/typescript-project.service.js';

export type IfunctionBody = zod.infer<typeof functionBodyDto>;
export type IfunctionBodyParameter = zod.infer<typeof functionBodyParameterZod>;
type IVariableType = zod.infer<typeof variableInfoZod>;

const defaultVariableType = (type: IVariableType['type']): IVariableType => {
  switch (type) {
    case 'string': {
      return { type: 'string' };
    }
    case 'boolean': {
      return { type: 'boolean' };
    }
    case 'number': {
      return { type: 'number', numberType: { type: 'any' } };
    }
    case 'array': {
      return { type: 'array', elementType: { type: 'string' }, dimensions: 1 };
    }
    case 'struct': {
      return { type: 'struct', id: '' };
    }
    case 'enum': {
      return { type: 'enum', schemeId: '', iconId: '' };
    }
    case 'void': {
      return { type: 'void' };
    }
    case 'any': {
      return { type: 'any' };
    }
    case 'never': {
      return { type: 'never' };
    }
    case 'union': {
      return { type: 'union', unionTypes: [] };
    }
    default: {
      return { type: 'string' };
    }
  }
};

export class FunctionBodyBlockEditorStore extends BlockEditorStore<IfunctionBody> {
  @observable data: IfunctionBody;
  readonly projectService: TypescriptProjectService | null;

  constructor(params: IBlockEditorFactoryParams<IfunctionBody>) {
    super(params);
    this.data = params.data;
    try {
      this.projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    } catch {
      this.projectService = null;
    }
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action addParameter() {
    this.data = {
      ...this.data,
      parameters: [...this.data.parameters, { name: '', type: { type: 'string' } }],
    };
  }

  @action removeParameter(index: number) {
    this.data = {
      ...this.data,
      parameters: this.data.parameters.filter((_, i) => i !== index),
    };
  }

  @action setParameterName(index: number, name: string) {
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) => (i === index ? { ...p, name } : p)),
    };
  }

  @action setParameterType(index: number, type: IVariableType['type']) {
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) => (i === index ? { ...p, type: defaultVariableType(type) } : p)),
    };
  }

  @action setParameterArrayElementType(index: number, type: IVariableType['type']) {
    const param = this.data.parameters[index];
    if (!param || param.type.type !== 'array') return;
    const current = param.type;
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) =>
        i === index ? { ...p, type: { ...current, elementType: defaultVariableType(type) } } : p,
      ),
    };
  }

  @action setParameterArrayDimensions(index: number, dimensions: number) {
    const param = this.data.parameters[index];
    if (!param || param.type.type !== 'array') return;
    const current = param.type;
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) => (i === index ? { ...p, type: { ...current, dimensions } } : p)),
    };
  }

  @action setParameterStructId(index: number, id: string) {
    const param = this.data.parameters[index];
    if (!param || param.type.type !== 'struct') return;
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) => (i === index ? { ...p, type: { type: 'struct', id } } : p)),
    };
  }

  @action setParameterArrayElementStructId(index: number, id: string) {
    const param = this.data.parameters[index];
    if (!param || param.type.type !== 'array' || param.type.elementType.type !== 'struct') return;
    const current = param.type;
    this.data = {
      ...this.data,
      parameters: this.data.parameters.map((p, i) =>
        i === index ? { ...p, type: { ...current, elementType: { type: 'struct', id } } } : p,
      ),
    };
  }

  /** `'void'` is represented as no `returnValue` at all (matching this DTO's own `default()`, and how
   * `getFunctionSignature`'s consumers already treat a missing `returnValue` — see
   * `@falang/logic-constructor`'s `compile-ts-function.ts`), not `{ type: 'void' }`. */
  @action setReturnValueType(type: IVariableType['type']) {
    if (type === 'void') {
      // oxlint-disable-next-line no-undefined -- clears a previously-set return type back to "omitted"
      this.data = { ...this.data, returnValue: undefined };
      return;
    }
    this.data = { ...this.data, returnValue: defaultVariableType(type) };
  }

  @action setReturnValueArrayElementType(type: IVariableType['type']) {
    const returnValue = this.data.returnValue;
    if (!returnValue || returnValue.type !== 'array') return;
    this.data = {
      ...this.data,
      returnValue: { ...returnValue, elementType: defaultVariableType(type) },
    };
  }

  @action setReturnValueArrayDimensions(dimensions: number) {
    const returnValue = this.data.returnValue;
    if (!returnValue || returnValue.type !== 'array') return;
    this.data = {
      ...this.data,
      returnValue: { ...returnValue, dimensions },
    };
  }

  @action setReturnValueStructId(id: string) {
    const returnValue = this.data.returnValue;
    if (!returnValue || returnValue.type !== 'struct') return;
    this.data = {
      ...this.data,
      returnValue: { type: 'struct', id },
    };
  }

  @action setReturnValueArrayElementStructId(id: string) {
    const returnValue = this.data.returnValue;
    if (!returnValue || returnValue.type !== 'array' || returnValue.elementType.type !== 'struct') return;
    this.data = {
      ...this.data,
      returnValue: { ...returnValue, elementType: { type: 'struct', id } },
    };
  }
}

import { resolveService } from '@falang/di';
import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { externalApiItemDto, functionBodyParameterZod, variableInfoZod } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypescriptProjectService } from '../../typescript-project-service/typescript-project.service.js';

export type IExternalApiItem = zod.infer<typeof externalApiItemDto>;
export type IExternalApiItemParameter = zod.infer<typeof functionBodyParameterZod>;
type IVariableType = zod.infer<typeof variableInfoZod>;

/** Duplicated from `function-body-editor.store.ts`/`object-property-editor.store.ts` — same accepted
 * per-block-kind duplication already established for this domain, see ADR 0019 (private) notes. */
export const defaultVariableType = (type: IVariableType['type']): IVariableType => {
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

export class ExternalApiItemBlockEditorStore extends BlockEditorStore<IExternalApiItem> {
  @observable data: IExternalApiItem;
  readonly projectService: TypescriptProjectService | null;

  constructor(params: IBlockEditorFactoryParams<IExternalApiItem>) {
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

  @action setName(name: string) {
    this.data = { ...this.data, name };
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

  @action setReturnValueType(type: IVariableType['type'] | 'none') {
    const { returnValue: _oldReturnValue, ...rest } = this.data;
    this.data = type === 'none' ? rest : { ...rest, returnValue: defaultVariableType(type) };
  }

  @action setReturnValueStructId(id: string) {
    if (this.data.returnValue?.type !== 'struct') return;
    this.data = { ...this.data, returnValue: { type: 'struct', id } };
  }
}

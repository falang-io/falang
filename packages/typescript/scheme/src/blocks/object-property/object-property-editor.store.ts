import { resolveService } from '@falang/di';
import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { objectPropertyDto, variableInfoZod } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypescriptProjectService } from '../../typescript-project-service/typescript-project.service.js';

export type IObjectProperty = zod.infer<typeof objectPropertyDto>;
type IVariableType = zod.infer<typeof variableInfoZod>;

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

export class ObjectPropertyBlockEditorStore extends BlockEditorStore<IObjectProperty> {
  @observable data: IObjectProperty;
  readonly projectService: TypescriptProjectService | null;

  constructor(params: IBlockEditorFactoryParams<IObjectProperty>) {
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
}

import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { FunctionHeaderBlockDto } from './FunctionHeader.block.dto';
import { FunctionHeaderBlockEditorComponent } from './FunctionHeader.block.editor.cmp';
import { FunctionHeaderBlockStore, ParameterStore } from './FunctionHeader.block.store';

export interface IFunctionHeaderBlockTransformerParams {
  overrideName?: (scheme: SchemeStore) => string
}

export class FunctionHeaderBlockTransformer extends BlockTransformer<FunctionHeaderBlockDto, FunctionHeaderBlockStore> {
  private overrideName?: (scheme: SchemeStore) => string

  constructor(params?: IFunctionHeaderBlockTransformerParams) {
    super({
      dtoConstructor: FunctionHeaderBlockDto,
      viewConfig: {
        editor: FunctionHeaderBlockEditorComponent,
      },
    });
    this.overrideName = params?.overrideName;
  }
  create(scheme: SchemeStore, id: string): FunctionHeaderBlockStore {
    const overrideName = this.overrideName;
    return new FunctionHeaderBlockStore({
      id,
      parameters: [],
      returnValue: {
        type: 'void'
      },
      scheme,
      transformer: this,
      width: CELL_SIZE * 12,
      overrideName: overrideName ? () => overrideName(scheme) : undefined,
      name: 'Function',
    })
  }
  fromDto(scheme: SchemeStore, dto: FunctionHeaderBlockDto, id: string): FunctionHeaderBlockStore {
    const overrideName = this.overrideName;
    return new FunctionHeaderBlockStore({
      id,
      ...dto,
      scheme,
      transformer: this,
      overrideName: overrideName ? () => overrideName(scheme) : undefined,
    })
  }
  /*isChanged(store: FunctionHeaderBlockStore, dto: FunctionHeaderBlockDto): boolean {
    if (store.nameStore.text !== dto.name) return true;
    if (!deepEqual(store.returnValue, dto.returnValue)) return true;
    if(dto.parameters.length !== store.parameters.length) return true;
    for (let i = 0; i < dto.parameters.length; i++) {
      if (!deepEqual(store.parameters[i], dto.parameters[i])) return true;
    }
    return false;
  }*/
  toDto(store: FunctionHeaderBlockStore): FunctionHeaderBlockDto {
    return {
      parameters: store.parameters.map((p) => ({
        name: p.nameStore.text,
        type: p.variableType,
      })),
      returnValue: store.returnStore.get(),
      width: store.width,
      name: store.nameStore.text,
    }
  }
  updateFromDto(store: FunctionHeaderBlockStore, dto: FunctionHeaderBlockDto): void {
    store.parameters.replace(dto.parameters.map((p) => new ParameterStore({
      ...p,
      scheme: store.scheme,
      projectStore: store.projectStore,
    })));
    store.returnStore.set(dto.returnValue);
  }

}
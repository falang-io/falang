import { BlockTransformer } from '@falang/editor-scheme';
import { BLOCK_DEFAULT_WIDTH, CELL_SIZE, generateId } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { ObjectDefinitionBlockDto } from './ObjectDefinition.block.dto';
import { ObjectDefinitionBlockStore } from './ObjectDefinition.block.store';
import { deepEqual } from '../../../logic/util/deepEqual';
import { EmptyBlockComponent } from '@falang/editor-scheme';
import { ObjectDefinitionBlockEditorComponent } from './ObjectDefinition.block.editor.cmp';
import { ObjectDefinitionBlockComponent } from './ObjectDefinition.block.cmp';

export interface IObjectDefinitionBlockTransformerParams {
}

export class ObjectDefinitionBlockTransformer extends BlockTransformer<ObjectDefinitionBlockDto, ObjectDefinitionBlockStore> {

  constructor(params?: IObjectDefinitionBlockTransformerParams) {
    super({
      dtoConstructor: ObjectDefinitionBlockDto,
      viewConfig: {
        bg: EmptyBlockComponent,
        editor: ObjectDefinitionBlockEditorComponent,
        renderer: ObjectDefinitionBlockComponent,
      }
    });
  }

  create(scheme: SchemeStore, id: string): ObjectDefinitionBlockStore {
    return new ObjectDefinitionBlockStore({
      id,
      scheme,
      width: CELL_SIZE * 12,
      transformer: this,
      name: 'x',
      variableType: {
        constant: false,
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
        optional: false,
      },
    })
  }

  createForType(scheme: SchemeStore) {
    return new ObjectDefinitionBlockStore({
      id: generateId(),
      scheme,
      width: BLOCK_DEFAULT_WIDTH,
      transformer: this,
      name: 'x',
      variableType: {
        constant: false,
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
        optional: false,
      },
    });
  }

  fromDto(scheme: SchemeStore, dto: ObjectDefinitionBlockDto, id: string): ObjectDefinitionBlockStore {
    return new ObjectDefinitionBlockStore({
      id,
      scheme,
      transformer: this,
      color: dto.color,
      ...dto,
    })
  }
  toDto(store: ObjectDefinitionBlockStore): ObjectDefinitionBlockDto {
    return {
      width: store.width,
      color: store.color,
      name: store.name,
      variableType: store.variableType,
    };
  }
  updateFromDto(store: ObjectDefinitionBlockStore, dto: ObjectDefinitionBlockDto): void {
    store.setName(dto.name);
    store.setVariableType(dto.variableType);
  }
  isChanged(store: ObjectDefinitionBlockStore, dto: ObjectDefinitionBlockDto): boolean {
    return store.name !== dto.name || !deepEqual(dto.variableType, store.variableType);
  }

}
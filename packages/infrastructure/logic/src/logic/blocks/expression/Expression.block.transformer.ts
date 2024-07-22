import { BlockTransformer, ITitledBlockTransformerParams } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { ExpressionBlockDto } from './Expression.block.dto';
import { ExpressionBlockStore } from './Expression.block.store';
import { TExpressionType } from '../../constants';
import { deepEqual } from '../../util/deepEqual';
import { EmptyBlockComponent } from '@falang/editor-scheme';
import { ExpressionBlockEditorComponent } from './Expression.block.editor.cmp';
import { ExpressionBlockComponent } from './Expression.block.cmp';

export interface IExpressionBlockTransformerParams extends ITitledBlockTransformerParams {
  type?: TExpressionType,
  defaultExpression?: string,
  customValidator?: (block: ExpressionBlockStore) => void,
}

export class ExpressionBlockTransformer extends BlockTransformer<ExpressionBlockDto, ExpressionBlockStore> {
  type: TExpressionType
  defaultExpression: string

  constructor(params?: IExpressionBlockTransformerParams) {
    super({
      dtoConstructor: ExpressionBlockDto,
      viewConfig: {
        editor: ExpressionBlockEditorComponent,
        renderer: ExpressionBlockComponent,
      },
      titleDx: params?.titleDx,
      title: params?.title,
    });
    this.type = params?.type ?? 'create';
    this.defaultExpression = params?.defaultExpression ?? 'x = 0';
  }

  create(scheme: SchemeStore, id: string): ExpressionBlockStore {
    return new ExpressionBlockStore({
      id,
      scheme,
      width: CELL_SIZE * 8,
      transformer: this,
      expression: this.defaultExpression,
      type: this.type,
      variableType: this.type === 'create' ? {
        constant: false,
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
        optional: false,
      } : null,
    })
  }

  /*createForType(scheme: SchemeStore, type: TExpressionType) {
    return new ExpressionBlockStore({
      id: nanoid(),
      scheme,
      width: BLOCK_DEFAULT_WIDTH,
      transformer: this,
      expression: 'x = 0',
      type,
      variableType: type === 'create' ? {
        constant: false,
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
        optional: false,
      } : null,
    });
  }*/

  fromDto(scheme: SchemeStore, dto: ExpressionBlockDto, id: string): ExpressionBlockStore {
    //console.log('dto', dto);
    return new ExpressionBlockStore({
      id,
      scheme,
      transformer: this,
      color: dto.color,
      ...dto,
    })
  }
  toDto(store: ExpressionBlockStore): ExpressionBlockDto {
    return {
      width: store.width,
      color: store.color,
      expression: store.expression,
      type: store.type,
      variableType: store.type === 'create' ? store.variableType : null,
    };
  }
  updateFromDto(store: ExpressionBlockStore, dto: ExpressionBlockDto): void {
    store.setExpression(dto.expression);
    store.setVariableType(dto.variableType);
    store.width = dto.width;
  }
  isChanged(store: ExpressionBlockStore, dto: ExpressionBlockDto): boolean {
    return store.expression === dto.expression && deepEqual(dto.variableType, store.variableType);
  }

}
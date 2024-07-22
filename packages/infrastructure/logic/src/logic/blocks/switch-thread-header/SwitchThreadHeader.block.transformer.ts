import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { TExpressionType } from '../../constants';
import { deepEqual } from '../../util/deepEqual';
import { SwitchThreadHeaderBlockStore } from './SwitchThreadHeader.block.store';
import { EmptyBlockComponent } from '@falang/editor-scheme';
import { SwitchThreadHeaderBlockDto } from './SwitchThreadHeader.block.dto';

export interface ISwitchThreadHeaderBlockTransformerParams {
  defaultExpression?: string,
}

export class SwitchThreadHeaderBlockTransformer extends BlockTransformer<SwitchThreadHeaderBlockDto, SwitchThreadHeaderBlockStore> {
  type: TExpressionType
  defaultExpression: string

  constructor(params?: ISwitchThreadHeaderBlockTransformerParams) {
    super({
      dtoConstructor: SwitchThreadHeaderBlockDto,
    });
    this.type = 'scalar';
    this.defaultExpression = params?.defaultExpression ?? 'x = 0';
  }

  create(scheme: SchemeStore, id: string): SwitchThreadHeaderBlockStore {
    return new SwitchThreadHeaderBlockStore({
      id,
      scheme,
      width: CELL_SIZE * 12,
      transformer: this,
      expression: this.defaultExpression,
      type: 'scalar',
      variableType: null,
    });
  }

  /*createForType(scheme: SchemeStore, type: TExpressionType) {
    return new SwitchThreadHeaderBlockStore({
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

  fromDto(scheme: SchemeStore, dto: SwitchThreadHeaderBlockDto, id: string): SwitchThreadHeaderBlockStore {
    return new SwitchThreadHeaderBlockStore({
      id,
      scheme,
      transformer: this,
      color: dto.color,
      ...dto,
      type: this.type,
    })
  }
  toDto(store: SwitchThreadHeaderBlockStore): SwitchThreadHeaderBlockDto {
    return {
      width: store.width,
      color: store.color,
      expression: store.isEnum ? store.enumSelectStore.selectedValues.join(',') : store.expression,
      variableType: null,
    };
  }
  updateFromDto(store: SwitchThreadHeaderBlockStore, dto: SwitchThreadHeaderBlockDto): void {
    store.expressionStore.setExpression(dto.expression);
    //store.setVariableType(dto.variableType);
    store.width = dto.width;
  }
  /*isChanged(store: SwitchThreadHeaderBlockStore, dto: SwitchThreadHeaderBlockDto): boolean {
    return store.expression === dto.expression && deepEqual(dto.variableType, store.variableType);
  }*/

}
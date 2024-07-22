import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { ForeachHeaderBlockComponent } from './ForeachHeader.block.cmp';
import { ForeachHeaderBlockDto } from './ForeachHeader.block.dto';
import { ForeachHeaderBlockEditorComponent } from './ForeachHeader.block.editor.cmp';
import { ForeachHeaderBlockStore } from './ForeachHeader.block.store';
import { ForeachHeaderLabelsComponent } from './ForeachHeaderLabels.cmp';

export class ForeachHeaderBlockTransformer extends BlockTransformer<ForeachHeaderBlockDto, ForeachHeaderBlockStore> {

  constructor() {
    super({
      dtoConstructor: ForeachHeaderBlockDto,
      viewConfig: {
        bg: ForeachHeaderLabelsComponent,
        editor: ForeachHeaderBlockEditorComponent,
        renderer: ForeachHeaderBlockComponent,
      }
    });
  }

  create(scheme: SchemeStore, id: string): ForeachHeaderBlockStore {
    return new ForeachHeaderBlockStore({
      id,
      arr: '',
      index: '',
      item: '',
      scheme,
      transformer: this,
      width: CELL_SIZE * 8,
      minWidth: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore, dto: ForeachHeaderBlockDto, id: string): ForeachHeaderBlockStore {
     return new ForeachHeaderBlockStore({
        id,
        scheme,
        ...dto,
        transformer: this,
     }); 
  }
  /*isChanged(store: ForeachHeaderBlockStore, dto: ForeachHeaderBlockDto): boolean {
    return store.arrExpression.expression === dto.arr 
      && store.itemExpression.expression === dto.item
      && store.indexExpression.expression === dto.index;
  }*/
  toDto(store: ForeachHeaderBlockStore): ForeachHeaderBlockDto {
    return {
      arr: store.arrExpression.expression,
      index: store.indexExpression.expression,
      item: store.itemExpression.expression,
      width: store.width,
    }
  }
  updateFromDto(store: ForeachHeaderBlockStore, dto: ForeachHeaderBlockDto): void {
    store.arrExpression.setExpression(dto.arr);
    store.itemExpression.setExpression(dto.item);
    store.indexExpression.setExpression(dto.index);
    store.width = dto.width;
  }
}

import { SchemeStore } from "@falang/editor-scheme";
import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from "@falang/editor-scheme";
import { FromToCycleHeaderBlockDto } from "./FromToCycleHeader.block.dto";
import { FromToCycleHeaderBlockStore } from "./FromToCycleHeader.block.store";

export class FromToCycleHeaderBlockTransformer extends BlockTransformer<FromToCycleHeaderBlockDto, FromToCycleHeaderBlockStore> {
  constructor() {
    super({
      dtoConstructor: FromToCycleHeaderBlockDto,
    });
  }
  create(scheme: SchemeStore, id: string, iconDto?: IconDto): FromToCycleHeaderBlockStore {
    return new FromToCycleHeaderBlockStore({
      scheme,
      id,
      from: '',
      item: '',
      to: '',
      transformer: this,
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore, dto: FromToCycleHeaderBlockDto, id: string, iconDto?: IconDto): FromToCycleHeaderBlockStore {
    return new FromToCycleHeaderBlockStore({
      scheme,
      id,
      ...dto,
      transformer: this,
    });
  }
  toDto(store: FromToCycleHeaderBlockStore): FromToCycleHeaderBlockDto {
    return {
      from: store.fromExpression.expression,
      to: store.toExpression.expression,
      item: store.itemExpression.expression,
      width: store.width,
    };
  }
  updateFromDto(store: FromToCycleHeaderBlockStore, dto: FromToCycleHeaderBlockDto): void {
    store.fromExpression.setExpression(dto.from);
    store.toExpression.setExpression(dto.to);
    store.itemExpression.setExpression(dto.item);
    store.width = dto.width;
  }
}
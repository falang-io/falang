import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { ArrPushBlockDto } from './ArrPush.block.dto';
import { ArrPushBlockStore } from './ArrPush.block.store';

export class ArrPushBlockTransformer extends BlockTransformer<ArrPushBlockDto, ArrPushBlockStore> {
  constructor() {
    super({
      dtoConstructor: ArrPushBlockDto,
    })
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto | undefined): ArrPushBlockStore {
    return new ArrPushBlockStore({
      arr: '',
      id,
      scheme,
      transformer: this,
      variable: '',
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: ArrPushBlockDto, id: string, iconDto?: IconDto | undefined): ArrPushBlockStore {
    return new ArrPushBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: ArrPushBlockStore): ArrPushBlockDto {
    return {
      arr: store.arrExpr.expression,
      variable: store.variableExpr.expression,
      width: store.width,
    };
  }
  updateFromDto(store: ArrPushBlockStore, dto: ArrPushBlockDto): void {
    store.arrExpr.setExpression(dto.arr);
    store.variableExpr.setExpression(dto.variable);
    store.width = dto.width;
  }
}

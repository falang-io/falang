import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { ArrPopBlockDto } from './ArrPop.block.dto';
import { ArrPopBlockStore } from './ArrPop.block.store';

export class ArrPopBlockTransformer extends BlockTransformer<ArrPopBlockDto, ArrPopBlockStore> {
  constructor() {
    super({
      dtoConstructor: ArrPopBlockDto,
    })
  }


  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto | undefined): ArrPopBlockStore {
    return new ArrPopBlockStore({
      arr: '',
      id,
      scheme,
      transformer: this,
      variable: '',
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: ArrPopBlockDto, id: string, iconDto?: IconDto | undefined): ArrPopBlockStore {
    return new ArrPopBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: ArrPopBlockStore): ArrPopBlockDto {
    return {
      arr: store.arrExpr.expression,
      variable: store.variableExpr.expression,
      width: store.width,
    };
  }
  updateFromDto(store: ArrPopBlockStore, dto: ArrPopBlockDto): void {
    store.arrExpr.setExpression(dto.arr);
    store.variableExpr.setExpression(dto.variable);
    store.width = dto.width;
  }
}

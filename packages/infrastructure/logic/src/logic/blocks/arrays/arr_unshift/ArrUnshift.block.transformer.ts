import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { ArrUnshiftBlockDto } from './ArrUnshift.block.dto';
import { ArrUnshiftBlockStore } from './ArrUnshift.block.store';

export class ArrUnshiftBlockTransformer extends BlockTransformer<ArrUnshiftBlockDto, ArrUnshiftBlockStore> {
  constructor() {
    super({
      dtoConstructor: ArrUnshiftBlockDto,
    })
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto | undefined): ArrUnshiftBlockStore {
    return new ArrUnshiftBlockStore({
      arr: '',
      id,
      scheme,
      transformer: this,
      variable: '',
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: ArrUnshiftBlockDto, id: string, iconDto?: IconDto | undefined): ArrUnshiftBlockStore {
    return new ArrUnshiftBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: ArrUnshiftBlockStore): ArrUnshiftBlockDto {
    return {
      arr: store.arrExpr.expression,
      variable: store.variableExpr.expression,
      width: store.width,
    };
  }
  updateFromDto(store: ArrUnshiftBlockStore, dto: ArrUnshiftBlockDto): void {
    store.arrExpr.setExpression(dto.arr);
    store.variableExpr.setExpression(dto.variable);
    store.width = dto.width;
  }
}

import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { ArrShiftBlockDto } from './ArrShift.block.dto';
import { ArrShiftBlockStore } from './ArrShift.block.store';

export class ArrShiftBlockTransformer extends BlockTransformer<ArrShiftBlockDto, ArrShiftBlockStore> {
  constructor() {
    super({
      dtoConstructor: ArrShiftBlockDto,
    })
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto | undefined): ArrShiftBlockStore {
    return new ArrShiftBlockStore({
      arr: '',
      id,
      scheme,
      transformer: this,
      variable: '',
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: ArrShiftBlockDto, id: string, iconDto?: IconDto | undefined): ArrShiftBlockStore {
    return new ArrShiftBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: ArrShiftBlockStore): ArrShiftBlockDto {
    return {
      arr: store.arrExpr.expression,
      variable: store.variableExpr.expression,
      width: store.width,
    };
  }
  updateFromDto(store: ArrShiftBlockStore, dto: ArrShiftBlockDto): void {
    store.arrExpr.setExpression(dto.arr);
    store.variableExpr.setExpression(dto.variable);
    store.width = dto.width;
  }
}

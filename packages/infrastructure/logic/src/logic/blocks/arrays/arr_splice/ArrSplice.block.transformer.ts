import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { ArrSpliceBlockDto } from './ArrSplice.block.dto';
import { ArrSpliceBlockStore } from './ArrSplice.block.store';

export class ArrSpliceBlockTransformer extends BlockTransformer<ArrSpliceBlockDto, ArrSpliceBlockStore> {
  constructor() {
    super({
      dtoConstructor: ArrSpliceBlockDto,
    })
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto | undefined): ArrSpliceBlockStore {
    return new ArrSpliceBlockStore({
      arr: '',
      id,
      scheme,
      transformer: this,
      variable: '',
      width: CELL_SIZE * 8,
      end: '',
      start: '',
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: ArrSpliceBlockDto, id: string, iconDto?: IconDto | undefined): ArrSpliceBlockStore {
    return new ArrSpliceBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: ArrSpliceBlockStore): ArrSpliceBlockDto {
    return {
      arr: store.arrExpr.expression,
      variable: store.variableExpr.expression,
      width: store.width,
      end: store.endExpr.expression,
      start: store.startExpr.expression,
    };
  }
  updateFromDto(store: ArrSpliceBlockStore, dto: ArrSpliceBlockDto): void {
    store.arrExpr.setExpression(dto.arr);
    store.variableExpr.setExpression(dto.variable);
    store.width = dto.width;
  }
}

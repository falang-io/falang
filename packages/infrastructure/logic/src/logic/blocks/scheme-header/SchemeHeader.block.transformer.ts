import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { SchemeHeaderBlockDto } from './SchemeHeader.block.dto';
import { SchemeHeaderBlockStore } from './SchemeHeader.block.store';

export interface ISchemeHeaderTransformerParams {
  titleLang: string
}

export class SchemeHeaderBlockTransformer extends BlockTransformer<SchemeHeaderBlockDto, SchemeHeaderBlockStore> {
  readonly titleLang: string;
  constructor(params: ISchemeHeaderTransformerParams) {
    super({
      dtoConstructor: SchemeHeaderBlockDto,
    });
    this.titleLang = params.titleLang;
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): SchemeHeaderBlockStore {
    return new SchemeHeaderBlockStore({
      id,
      scheme,
      transformer: this,
      width: CELL_SIZE * 10,
      titleLang: this.titleLang,
    })
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: SchemeHeaderBlockDto, id: string): SchemeHeaderBlockStore {
    return new SchemeHeaderBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
      titleLang: this.titleLang,
    })
  }
  toDto(store: SchemeHeaderBlockStore): SchemeHeaderBlockDto {
    return {
      width: store.width,
    }
  }
  updateFromDto(store: SchemeHeaderBlockStore, dto: SchemeHeaderBlockDto): void {
    
  }
}
import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { EnumItemBlockDto } from './EnumItem.block.dto';
import { EnumItemBlockStore } from './EnumItem.block.store';

export class EnumItemBlockTransformer extends BlockTransformer<EnumItemBlockDto, EnumItemBlockStore> {
  constructor() {
    super({
      dtoConstructor: EnumItemBlockDto,
    });
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): EnumItemBlockStore {
    return new EnumItemBlockStore({
      id,
      scheme,
      key: '',
      value: '',
      transformer: this,
      width: CELL_SIZE * 6
    }); 
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: EnumItemBlockDto, id: string): EnumItemBlockStore {
    return new EnumItemBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    }); 
  }
  toDto(store: EnumItemBlockStore): EnumItemBlockDto {
    return {
      key: store.keyStore.text,
      value: store.valueStore.text,
      width: store.width,
    }
  }
  updateFromDto(store: EnumItemBlockStore, dto: EnumItemBlockDto): void {
    store.keyStore.setText(String(dto.key));
    store.valueStore.setText(String(dto.value));
    store.width = dto.width;
  }  
}
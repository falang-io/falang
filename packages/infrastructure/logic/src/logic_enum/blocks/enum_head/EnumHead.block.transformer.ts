import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { TEnumTypeVariant } from '../../../logic/constants';
import { EnumHeadBlockDto } from './EnumHead.block.dto';
import { EnumHeadBlockStore } from './EnumHead.block.store';

export class EnumHeadBlockTransformer extends BlockTransformer<EnumHeadBlockDto, EnumHeadBlockStore> {
  constructor() {
    super({
      dtoConstructor: EnumHeadBlockDto,
    });
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): EnumHeadBlockStore {
    return new EnumHeadBlockStore({
      id,
      name: 'New_enum',
      scheme,
      transformer: this,
      valueType: 'string',
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: EnumHeadBlockDto, id: string): EnumHeadBlockStore {
    return new EnumHeadBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: EnumHeadBlockStore): EnumHeadBlockDto {
    return {
      name: store.name.text,
      valueType: (store.selectTypeStore.selectedValue as TEnumTypeVariant | null) ?? 'string',
      width: store.width,
    }
  }
  updateFromDto(store: EnumHeadBlockStore, dto: EnumHeadBlockDto): void {
    store.name.setText(dto.name);
    store.width = dto.width;
    store.selectTypeStore.setValue(dto.valueType);
  }

}
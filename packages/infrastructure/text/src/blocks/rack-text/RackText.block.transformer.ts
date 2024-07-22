
import { BlockTransformer, SchemeStore } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { RackTextBlockDto } from "./RackText.block.dto";
import { RackTextBlockStore } from "./RackText.block.store";

export class RackTextBlockTransformer extends BlockTransformer<RackTextBlockDto, RackTextBlockStore> {
  constructor() {
    super({
      dtoConstructor: RackTextBlockDto,
    });
  }

  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string, iconDto?: IconDto): RackTextBlockStore {
    return new RackTextBlockStore({
      color: '#ffffff',
      id,
      scheme,
      text: '',
      topText: '',
      transformer: this,
      width: CELL_SIZE * 8,
    })   
  }
  toDto(store: RackTextBlockStore): RackTextBlockDto {
    return {
      color: store.color,
      text: store.textStore.text,
      topText: store.topTextStore.text,
      width: store.width,
    }
  }
  updateFromDto(store: RackTextBlockStore, dto: RackTextBlockDto): void {
    store.color = dto.color;
    store.textStore.setText(dto.text);
    store.topTextStore.setText(dto.topText);
    store.textStore.setWidth(dto.width);
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: RackTextBlockDto, id: string, iconDto?: IconDto): RackTextBlockStore {
    return new RackTextBlockStore({
      ...dto,
      id,
      scheme,
      transformer: this,
    })
  }
}
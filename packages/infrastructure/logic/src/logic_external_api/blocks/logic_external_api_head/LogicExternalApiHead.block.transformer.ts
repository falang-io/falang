import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { LogicExternalApiHeadBlockDto } from './LogicExternalApiHead.block.dto';
import { LogicExternalApiHeadBlockStore } from './LogicExternalApiHead.block.store';

export class LogicExternalApiHeadBlockTransformer extends BlockTransformer<LogicExternalApiHeadBlockDto, LogicExternalApiHeadBlockStore> {
  constructor() {
    super({
      dtoConstructor: LogicExternalApiHeadBlockDto,
    });
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): LogicExternalApiHeadBlockStore {
    return new LogicExternalApiHeadBlockStore({
      id,
      name: 'New_Api',
      scheme,
      transformer: this,
      width: CELL_SIZE * 8,
    });
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: LogicExternalApiHeadBlockDto, id: string): LogicExternalApiHeadBlockStore {
    return new LogicExternalApiHeadBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    });
  }
  toDto(store: LogicExternalApiHeadBlockStore): LogicExternalApiHeadBlockDto {
    return {
      name: store.name.text,
      width: store.width,
    }
  }
  updateFromDto(store: LogicExternalApiHeadBlockStore, dto: LogicExternalApiHeadBlockDto): void {
    store.name.setText(dto.name);
    store.width = dto.width;
  }

}
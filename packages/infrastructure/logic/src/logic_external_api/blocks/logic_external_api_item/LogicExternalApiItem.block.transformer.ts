import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { InfrastructureType } from '@falang/editor-scheme';
import { LogicExternalApiItemBlockDto } from './LogicExternalApiItem.block.dto';
import { LogicExternalApiItemBlockStore } from './LogicExternalApiItem.block.store';

export class LogicExternalApiItemBlockTransformer extends BlockTransformer<LogicExternalApiItemBlockDto, LogicExternalApiItemBlockStore> {
  constructor() {
    super({
      dtoConstructor: LogicExternalApiItemBlockDto,
    });
  }
  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): LogicExternalApiItemBlockStore {
    return new LogicExternalApiItemBlockStore({
      id,
      scheme,
      key: '',
      value: '',
      transformer: this,
      width: CELL_SIZE * 6
    }); 
  }
  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: LogicExternalApiItemBlockDto, id: string): LogicExternalApiItemBlockStore {
    return new LogicExternalApiItemBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
    }); 
  }
  toDto(store: LogicExternalApiItemBlockStore): LogicExternalApiItemBlockDto {
    return {
      key: store.keyStore.text,
      value: store.valueStore.text,
      width: store.width,
    }
  }
  updateFromDto(store: LogicExternalApiItemBlockStore, dto: LogicExternalApiItemBlockDto): void {
    store.keyStore.setText(String(dto.key));
    store.valueStore.setText(String(dto.value));
    store.width = dto.width;
  }  
}
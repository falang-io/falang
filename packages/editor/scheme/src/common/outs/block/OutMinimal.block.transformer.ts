import { IconDto } from '../../../icons/base/Icon.dto';
import { IInfrastructureConfig } from '../../../infrastructure/IInfrastructureConfig';
import { InfrastructureType } from '../../../infrastructure/InfrastructureType';
import { SchemeStore } from '../../../store/Scheme.store';
import { BlockDto } from '../../blocks/Block.dto';
import { BlockTransformer } from '../../blocks/Block.transformer';
import { CELL_SIZE_4 } from '../../constants';
import { OutDto } from '../Out.dto';
import { OutMinimalBlockStore } from './OutMinimal.block.store';

export class OutMinimalBlockTransformer extends BlockTransformer<BlockDto, OutMinimalBlockStore, OutDto> {
  constructor() {
    super({
      dtoConstructor: OutMinimalBlockStore,
    });
  }

  create(scheme: SchemeStore, id: string, iconDto?: OutDto | undefined): OutMinimalBlockStore {
    return new OutMinimalBlockStore({
      id,
      scheme,
      outLevel: iconDto?.level ?? 1,
      transformer: this,
      type: iconDto?.type ?? 'break',
      width: CELL_SIZE_4,
      editable: false,            
    });
  }

  fromDto(scheme: SchemeStore, _dto: BlockDto, id: string, iconDto?: OutDto | undefined): OutMinimalBlockStore {
    return new OutMinimalBlockStore({
      id,
      scheme,
      outLevel: iconDto?.level ?? 1,
      transformer: this,
      type: iconDto?.type ?? 'break',
      width: CELL_SIZE_4,
      editable: false,      
    });
  }

  toDto(): BlockDto {
    return { width: CELL_SIZE_4 };
  }

  updateFromDto(): void {}
}

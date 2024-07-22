import { nanoid } from 'nanoid';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { SchemeStore } from '../../store/Scheme.store';
import { IconDto } from '../base/Icon.dto';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { InputIconStore } from './Input.icon.store';

export class InputTransformer extends IconTransformer<IconDto, InputIconStore> {

  create(scheme: SchemeStore, block?: BlockStore, fixedId?: string): InputIconStore {
    const id = fixedId ?? nanoid();
    return new InputIconStore({
      alias: this.alias,
      block: block ?? this.blockTransformer.create(scheme, id),
      id,
      scheme,
      transformer: this,
    });
  }

  fromDto(scheme: SchemeStore, dto: IconDto): InputIconStore {
    return new InputIconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      id: dto.id,
      scheme,
      transformer: this,
      leftSide: this.getLeftSide(scheme, dto),
    });
  }

  toDto(store: InputIconStore): IconDto {
    const returnValue: IconDto = {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),      
    }
    if(this.leftSideTransformer && store.leftSideStore) {
      returnValue.leftSide = this.leftSideTransformer.toDto(store.leftSideStore);
    }
    return returnValue;
  }
}

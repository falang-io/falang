import { nanoid } from 'nanoid';
import { EmptyBlockTransformer } from '../../common/blocks/Block.transformer';
import { SchemeStore } from '../../store/Scheme.store';
import { IconDto } from '../base/Icon.dto';
import { IconTransformer } from '../base/Icon.transformer';
import { EmptyIconStore } from './EmptyIconStore';

export class EmptyIconTransformer extends IconTransformer<IconDto, EmptyIconStore> {

  private static transformerStatic: EmptyIconTransformer | null = null;

  static getTransformer() {
    if(EmptyIconTransformer.transformerStatic) {
      return EmptyIconTransformer.transformerStatic;
    }
    const transformer = new EmptyIconTransformer();
    EmptyIconTransformer.transformerStatic = transformer;
    return transformer;
  }

  constructor(){
    super({
      alias: 'system',
      blockTransformer: new EmptyBlockTransformer(''),
      dtoConstructor: IconDto,
    });
  }

  create(scheme: SchemeStore): EmptyIconStore {
    console.error('Should not create empty icon from transformer');
    return new EmptyIconStore(scheme);
  }

  fromDto(scheme: SchemeStore, dto: IconDto): EmptyIconStore {
    console.error('Should not call fromDto from transformer');
    return new EmptyIconStore(scheme);
  }

  toDto(store: EmptyIconStore): IconDto {
    console.error('Should not call toDto from transformer');
    return {
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      id: store.id,
    }
  }
}

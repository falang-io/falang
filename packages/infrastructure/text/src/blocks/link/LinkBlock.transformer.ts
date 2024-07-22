import { BlockTransformer } from '@falang/editor-scheme';
import { BLOCK_DEFAULT_WIDTH } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { LinkBlockComponent } from './Link.block.cmp';
import { LinkBlockEditorComponent } from './LinkBlockEditor.cmp';
import { LinkBlockDto } from './LinkBlock.dto';
import { LinkBlockStore } from './LinkBlockStore';
import { EmptyBlockComponent } from '@falang/editor-scheme';

export class LinkBlockTransformer extends BlockTransformer<LinkBlockDto, LinkBlockStore> {
  constructor() {
    super({
      dtoConstructor: LinkBlockDto,
      viewConfig: {
        bg: EmptyBlockComponent,
        editor: LinkBlockEditorComponent,
        renderer: LinkBlockComponent,
      },
    });
  }

  create(scheme: SchemeStore, id: string): LinkBlockStore {
    return new LinkBlockStore({
      id,
      scheme,
      width: BLOCK_DEFAULT_WIDTH,
      text: '',
      transformer: this,
      schemeId: '',
    })
  }
  fromDto(scheme: SchemeStore, dto: LinkBlockDto, id: string): LinkBlockStore {
    return new LinkBlockStore({
      id,
      scheme,
      width: dto.width,
      text: dto.text,
      transformer: this,
      color: dto.color,
      schemeId: dto.schemeId,
    })
  }
  toDto(store: LinkBlockStore): LinkBlockDto {
    return {
      text: store.text,
      width: store.width,
      schemeId: store.schemeId,
      color: store.color,
    };   
  }
  updateFromDto(store: LinkBlockStore, dto: LinkBlockDto): void {
    store.setText(dto.text);
  }
  isChanged(store: LinkBlockStore, dto: LinkBlockDto): boolean {
    return store.text !== dto.text;
  }

}
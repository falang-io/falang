import { BlockTransformer, ITitledBlockTransformerParams } from '@falang/editor-scheme';
import { BLOCK_DEFAULT_WIDTH } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { TextBlockComponent } from './Text.block.cmp';
import { TextBlockEditorComponent } from './TextBlockEditor.cmp';
import { TextBlockDto } from './TextBlock.dto';
import { TextBlockStore, TTextBlockStoreParams } from './TextBlockStore';
import { EmptyBlockComponent } from '@falang/editor-scheme';

type TTextBlockConstructor = {
  new (params: TTextBlockStoreParams): TextBlockStore
}

export interface ITextBlockTransformerParams extends ITitledBlockTransformerParams {
  Constructor?: TTextBlockConstructor
  fixedText?: string
}

export class TextBlockTransformer extends BlockTransformer<TextBlockDto, TextBlockStore> {
  readonly fixed?: boolean;
  readonly fixedText?: string;
  private readonly Constructor: TTextBlockConstructor
  constructor(params?: ITextBlockTransformerParams) {
    super({
      dtoConstructor: TextBlockDto,
      viewConfig: {
        editor: TextBlockEditorComponent,
        renderer: TextBlockComponent,
      },
      title: params?.title,
      titleDx: params?.titleDx,
    });
    this.Constructor = params?.Constructor ?? TextBlockStore;
    this.fixed = !!params?.fixedText;
    this.fixedText = params?.fixedText;
  }

  create(scheme: SchemeStore, id: string): TextBlockStore {
    return new this.Constructor({
      id,
      scheme,
      width: BLOCK_DEFAULT_WIDTH,
      text: this.fixedText ?? '',
      transformer: this,
      fixed: this.fixed,
      editable: !this.fixed,
      title: this.title,
      titleDx: this.titleDx,
    })
  }
  fromDto(scheme: SchemeStore, dto: TextBlockDto, id: string): TextBlockStore {
    return new this.Constructor({
      id,
      scheme,
      width: dto.width,
      text: this.fixed ? (this.fixedText ?? '') : dto.text,
      transformer: this,
      color: dto.color,
      fixed: this.fixed,
      editable: !this.fixed,
      title: this.title,
      titleDx: this.titleDx,
    })
  }
  toDto(store: TextBlockStore): TextBlockDto {
    return {
      text: this.fixed ? '' : store.text,
      width: store.width,
      color: store.color,
    };   
  }
  updateFromDto(store: TextBlockStore, dto: TextBlockDto): void {
    store.setText(dto.text);
  }
  isChanged(store: TextBlockStore, dto: TextBlockDto): boolean {
    return store.text !== dto.text;
  }

}
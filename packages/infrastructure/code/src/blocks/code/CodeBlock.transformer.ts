import { BlockTransformer } from '@falang/editor-scheme';
import { EmptyBlockComponent, BLOCK_DEFAULT_WIDTH } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { CodeBlockComponent } from './CodeBlock.cmp';
import { CodeBlockDto } from './CodeBlock.dto';
import { CodeBlockStore } from './CodeBlock.store';
import { CodeBlockEditorComponent } from './CodeBlockEditor.cmp';

export class CodeBlockTransformer extends BlockTransformer<CodeBlockDto, CodeBlockStore> {
  constructor() {
    super({
      dtoConstructor: CodeBlockDto,
      viewConfig: {
        bg: EmptyBlockComponent,
        editor: CodeBlockEditorComponent,
        renderer: CodeBlockComponent,
      }
    });
  }

  create(scheme: SchemeStore, id: string): CodeBlockStore {
    return new CodeBlockStore({
      id,
      scheme,
      width: BLOCK_DEFAULT_WIDTH,
      code: '',
      language: scheme.infrastructure.config.language ?? '',
      transformer: this,
    })
  }
  fromDto(scheme: SchemeStore, dto: CodeBlockDto, id: string): CodeBlockStore {
    return new CodeBlockStore({
      id,
      scheme,
      width: dto.width,
      code: dto.code,
      language: scheme.infrastructure.config.language ?? '',
      transformer: this,
    })
  }
  toDto(store: CodeBlockStore): CodeBlockDto {
    return {
      code: store.code,
      width: store.width,
    };   
  }
  updateFromDto(store: CodeBlockStore, dto: CodeBlockDto): void {
    store.codeStore.code = dto.code;
  }
  isChanged(store: CodeBlockStore, dto: CodeBlockDto): boolean {
    return store.code !== dto.code;
  }

}
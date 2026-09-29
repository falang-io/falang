import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import type { TCodeLanguage } from '@falang/simple-code-dto';
import { RawCodeEditBlockComponent } from './raw-code-block-editor.cmp.js';
import { RawCodeBlockEditorStore } from './raw-code-block-editor.store.js';
import { getRawCodeBlockComponent } from './raw-code-block.cmp.js';

const cache = new Map<TCodeLanguage, IBlockConfig<string>>();

/** One block config per language (memoized) — every editable field across the `code` domain (action
 * body, if/switch/while conditions, foreach header, function header/footer/body) is a raw string, so
 * one config, closed over its document's language, serves all of them — same as the old app's single
 * `CodeBlockDto`/`CodeBlockTransformer` reused across every icon type. */
export const getRawCodeBlockConfig = (language: TCodeLanguage): IBlockConfig<string> => {
  const cached = cache.get(language);
  if (cached) return cached;
  const config: IBlockConfig<string> = {
    view: getRawCodeBlockComponent(language),
    minHeight: CELL_SIZE_2,
    editor: {
      view: RawCodeEditBlockComponent,
      editorFactory: (params) => new RawCodeBlockEditorStore(params, language),
      type: EditorType.inline,
    },
  };
  cache.set(language, config);
  return config;
};

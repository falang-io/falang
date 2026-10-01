import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { HtmlBlockComponent } from './html-block.cmp.js';
import { HtmlBlockEditorStore } from './html-block-editor.store.js';
import { HtmlBlockEditorComponent } from './html-block-editor.cmp.js';

/**
 * A rich-text block backed by the Lexical editor — replaces `text-block.config.ts`'s bare
 * `contentEditable` div across the whole text domain (see ADR 0028 (private) and
 * `functional.ts`/`mind-tree.ts`). The node's `data` is still a plain HTML string
 * (`stringDataType` in `@falang/text-dto`, unchanged) — Lexical is only how it's edited/rendered.
 */
export const htmlBlockConfig = {
  view: HtmlBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: HtmlBlockEditorComponent,
    editorFactory: (params) => new HtmlBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;

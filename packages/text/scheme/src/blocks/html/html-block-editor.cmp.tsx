import { useEffect, useRef } from 'react';
import type { EditorThemeClasses, LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer.js';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext.js';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin.js';
import { ContentEditable } from '@lexical/react/LexicalContentEditable.js';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin.js';
import { ListPlugin } from '@lexical/react/LexicalListPlugin.js';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary.js';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import type { TBlockEditorView } from '@falang/scheme';
import type { HtmlBlockEditorStore } from './html-block-editor.store.js';
import { ImageNode } from './lexical/image-node.js';
import { ImagesPlugin } from './lexical/images-plugin.js';
import { htmlToNodes } from './lexical/html-io.js';
import { HtmlBlockToolbar } from './html-block-toolbar.cmp.js';

const theme: EditorThemeClasses = {
  image: 'editor-image',
  text: {
    bold: 'falang-html-bold',
    italic: 'falang-html-italic',
    strikethrough: 'falang-html-strikethrough',
    underline: 'falang-html-underline',
  },
};

const onError = (error: Error) => {
  throw error;
};

/**
 * Parses `initialData` into the editor once on mount, then places the caret at the end and
 * autofocuses — runs before anything else can be typed, mirroring how the old bare-`contentEditable`
 * block auto-focused on entering edit mode.
 */
const InitialContentLoader: React.FC<{ editor: LexicalEditor; initialData: string; store: HtmlBlockEditorStore }> = ({
  editor,
  initialData,
  store,
}) => {
  const loadedRef = useRef(false);
  useEffect(() => {
    store.setLexicalEditor(editor);
  }, [editor, store]);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    htmlToNodes(editor, initialData);
    editor.update(() => {
      $getRoot().selectEnd();
    });
    editor.focus();
  }, [editor, initialData]);
  return null;
};

const EditorInner: React.FC<{ initialData: string; store: HtmlBlockEditorStore }> = ({ initialData, store }) => {
  const [editor] = useLexicalComposerContext();
  return (
    <>
      <HtmlBlockToolbar editor={editor} />
      <RichTextPlugin
        contentEditable={<ContentEditable spellCheck={false} className="falang-html-editable" />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <ImagesPlugin />
      <InitialContentLoader editor={editor} initialData={initialData} store={store} />
    </>
  );
};

// Mousedown/mouseup are stopped here (in addition to `@falang/scheme`'s own `EditorModule`, which
// already stops `mousemove` bubbling to the pan handler while in inline-edit mode — see
// `init-editor-handlers.ts`'s `CMD_ICON_MOUSE_MOVE` handler) so a mouse drag that selects text
// inside the editor can never be mistaken by an ancestor handler for a scheme-level interaction.
export const HtmlBlockEditorComponent: TBlockEditorView<HtmlBlockEditorStore> = ({ editor: store }) => (
  <div
    className="falang-html-block-editor"
    onMouseDown={(e) => e.stopPropagation()}
    onMouseUp={(e) => e.stopPropagation()}
  >
    <LexicalComposer
      initialConfig={{
        namespace: 'falang-html-block',
        nodes: [ImageNode, HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
        onError,
        theme,
      }}
    >
      <EditorInner initialData={store.getData()} store={store} />
    </LexicalComposer>
  </div>
);

import type { TBlockEditorView } from '@falang/scheme';
import type { TextBlockEditorStore } from './text-block-editor.store.ts';
import { sanitizeHtml } from '../../utils/sanitize-html.js';
import { useEffect, useRef } from 'react';

export const TextBlockEditorComponent: TBlockEditorView<TextBlockEditorStore> = ({ editor }) => {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (divRef.current) {
      divRef.current.focus();

      const range = document.createRange();
      const selection = globalThis.getSelection();
      range.selectNodeContents(divRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, []);

  return (
    <div
      ref={divRef}
      contentEditable
      className="editable-content"
      onInput={(e) => editor.setValue(e.currentTarget.innerHTML)}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(editor.data) }}
    />
  );
};

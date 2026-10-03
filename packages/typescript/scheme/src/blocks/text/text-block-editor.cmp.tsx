import type { TBlockEditorView } from '@falang/scheme';
import type { TextBlockEditorStore } from './text-block-editor.store.ts';
import { useEffect, useRef } from 'react';

export const TextBlockEditorComponent: TBlockEditorView<TextBlockEditorStore> = ({ editor }) => {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (divRef.current) {
      // Plain text, never HTML: `innerHTML` round-trips would store `<` as `&lt;`.
      divRef.current.textContent = editor.data;
      divRef.current.focus();

      const range = document.createRange();
      const selection = globalThis.getSelection();
      range.selectNodeContents(divRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editor]);

  return (
    <div
      ref={divRef}
      contentEditable={'plaintext-only' as unknown as boolean}
      suppressContentEditableWarning
      className="editable-content"
      onInput={(e) => editor.setValue(e.currentTarget.textContent ?? '')}
    />
  );
};

import { DEFAULT_MODES, TOKEN_I18N, TOKEN_SCHEME, useService, type TBlockEditorView } from '@falang/scheme';
import { useEffect, useRef } from 'react';
import type { MagicSpellEditorStore } from './magic-spell-editor.store.js';

/**
 * Textarea editor: Enter (without Shift) commits, Escape cancels; both end the inline-editing mode, which
 * makes the editor service write the data (the cancelled store returns the old data).
 */
export const MagicSpellEditorComponent: TBlockEditorView<MagicSpellEditorStore> = ({ editor }) => {
  const scheme = useService(TOKEN_SCHEME);
  const t = useService(TOKEN_I18N).t;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="editable-content"
      style={{ width: '100%', boxSizing: 'border-box', resize: 'none', font: 'inherit', minHeight: 40 }}
      placeholder={t('magic:placeholder')}
      defaultValue={editor.spell}
      onChange={(e) => editor.setSpell(e.currentTarget.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          editor.cancel();
          scheme.mode.setMode(DEFAULT_MODES.START);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          scheme.mode.setMode(DEFAULT_MODES.START);
        }
      }}
    />
  );
};

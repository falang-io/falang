import type React from 'react';
import { observer } from 'mobx-react-lite';
import { resolveEditorType, TOKEN_INLINE_EDITOR_SERVICE, TOKEN_SCHEME, useService } from '@falang/scheme';

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 350,
    flexShrink: 0,
    borderLeft: '1px solid #313244',
    padding: '10px 10px 10px 10px',
    boxSizing: 'border-box',
    overflow: 'auto',
  },
};

export const Sidebar: React.FC = observer(() => {
  const inlineEditor = useService(TOKEN_INLINE_EDITOR_SERVICE);
  const scheme = useService(TOKEN_SCHEME);
  if (!inlineEditor.editingStore || !inlineEditor.editingId) return null;
  const editingIcon = scheme.icons.getIconSafe(inlineEditor.editingId);
  if (!editingIcon) return null;
  const editorConfig = editingIcon.config.block.editor;
  if (!editorConfig || resolveEditorType(editorConfig, inlineEditor.editingStore) !== 'sidebar') return null;
  const EditorView = editorConfig.view;
  return (
    <div style={styles.sidebar}>
      <EditorView editor={inlineEditor.editingStore} icon={editingIcon} />
    </div>
  );
});

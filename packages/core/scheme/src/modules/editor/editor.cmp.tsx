import { observer } from 'mobx-react-lite';
import type { IBlockExtraView } from '../../types/block-extra-view.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';
import { resolveEditorType } from '../../types/block-config.js';

export const EditorComponent: IBlockExtraView = observer(({ icon }) => {
  const service = useService(TOKEN_INLINE_EDITOR_SERVICE);
  const BlockView = icon.config.block.view;
  if (icon.id !== service.editingId || !icon.config.block.editor) {
    return <BlockView data={icon.dataNode.data} width={icon.blockWidth} icon={icon} />;
  }
  if (resolveEditorType(icon.config.block.editor, service.editingStore) === 'sidebar' && service.editingStore) {
    return <BlockView data={service.editingStore.getData()} width={icon.blockWidth} icon={icon} />;
  }
  const EditorView = icon.config.block.editor?.view;
  if (!EditorView) return <>Error: no editor view for icon {icon.name}</>;
  const editorStore = service.editingStore;
  if (!editorStore) return <>Error: no editor store for icon {icon.name}</>;
  return <EditorView editor={editorStore} icon={icon} />;
});

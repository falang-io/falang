import type { TBlockEditorView } from '@falang/scheme';
import type { IfEditorStore } from './if-editor.store.js';
import { observer } from 'mobx-react-lite';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const IfEditBlockComponent: TBlockEditorView<IfEditorStore> = observer(({ editor }) => (
  <ExpressionEditorCellComponent store={editor.codeStore} hiddenPrefix={editor.hiddenPrefix} />
));

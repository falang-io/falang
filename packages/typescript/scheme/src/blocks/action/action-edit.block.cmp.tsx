import type { TBlockEditorView } from '@falang/scheme';
import type { ActionEditorStore } from './action-editor.store.js';
import { observer } from 'mobx-react-lite';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const ActionEditBlockComponent: TBlockEditorView<ActionEditorStore> = observer(({ editor }) => (
  <ExpressionEditorCellComponent store={editor.codeStore} hiddenPrefix={editor.hiddenScopeCode} />
));

import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { LogBlockEditorStore } from './log-editor.store.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const LogEditBlockComponent: TBlockEditorView<LogBlockEditorStore> = observer(({ editor }) => (
  <ExpressionEditorCellComponent
    store={editor.message.codeStore}
    hiddenPrefix={editor.message.hiddenPrefix}
    hiddenSuffix={editor.message.hiddenSuffix}
  />
));

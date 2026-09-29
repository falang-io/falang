import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ArrOpReturningBlockEditorStore } from './arr-op-returning-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';
import { NewVariableEditingComponent } from '../../block-elements/new-variable/new-variable.editing.cmp.js';

export const ArrOpReturningBlockEditorComponent: TBlockEditorView<ArrOpReturningBlockEditorStore> = observer(
  ({ editor }) => (
    <TypeScriptBlockContainer>
      <table className="ts-table ts-table--fixed">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">arr</div>
            </td>
            <td>
              <ExpressionEditorCellComponent store={editor.arrCodeStore} hiddenPrefix={editor.arrHiddenPrefix} />
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">var</div>
            </td>
            <td>
              <NewVariableEditingComponent store={editor.variableStore} autoFocus={false} />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  ),
);

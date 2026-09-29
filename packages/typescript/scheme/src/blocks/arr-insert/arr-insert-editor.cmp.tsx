import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ArrInsertBlockEditorStore } from './arr-insert-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const ArrInsertBlockEditorComponent: TBlockEditorView<ArrInsertBlockEditorStore> = observer(({ editor }) => (
  <TypeScriptBlockContainer>
    <table className="ts-table ts-table--fixed">
      <tbody>
        <tr>
          <td>
            <div className="ts-label">arr</div>
          </td>
          <td>
            <ExpressionEditorCellComponent store={editor.arrCodeStore} hiddenPrefix={editor.hiddenScopeCode} />
          </td>
        </tr>
        <tr>
          <td>
            <div className="ts-label">start</div>
          </td>
          <td>
            <ExpressionEditorCellComponent
              store={editor.startCodeStore}
              hiddenPrefix={editor.hiddenScopeCode}
              autoFocus={false}
            />
          </td>
        </tr>
        <tr>
          <td>
            <div className="ts-label">insert</div>
          </td>
          <td>
            <ExpressionEditorCellComponent
              store={editor.insertArrCodeStore}
              hiddenPrefix={editor.insertArrHiddenPrefix}
              autoFocus={false}
            />
          </td>
        </tr>
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

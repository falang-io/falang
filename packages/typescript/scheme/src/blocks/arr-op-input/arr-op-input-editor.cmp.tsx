import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ArrOpInputBlockEditorStore } from './arr-op-input-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const ArrOpInputBlockEditorComponent: TBlockEditorView<ArrOpInputBlockEditorStore> = observer(({ editor }) => (
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
            <div className="ts-label">value</div>
          </td>
          <td>
            {editor.valueTextStore ? (
              <ExpressionEditorCellComponent
                key="text"
                store={editor.valueTextStore.codeStore}
                hiddenPrefix={editor.valueTextStore.hiddenPrefix}
                hiddenSuffix={editor.valueTextStore.hiddenSuffix}
                autoFocus={false}
              />
            ) : (
              <ExpressionEditorCellComponent
                key="expression"
                store={editor.valueCodeStore}
                hiddenPrefix={editor.valueHiddenPrefix}
                autoFocus={false}
              />
            )}
          </td>
        </tr>
      </tbody>
    </table>
  </TypeScriptBlockContainer>
));

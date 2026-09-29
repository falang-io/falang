import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { FromToCycleHeaderBlockEditorStore } from './from-to-cycle-header-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const FromToCycleHeaderBlockEditorComponent: TBlockEditorView<FromToCycleHeaderBlockEditorStore> = observer(
  ({ editor }) => {
    const { data } = editor;
    return (
      <TypeScriptBlockContainer>
        <table className="ts-table ts-table--fixed">
          <tbody>
            <tr>
              <td>
                <div className="ts-label">from</div>
              </td>
              <td>
                <ExpressionEditorCellComponent store={editor.fromCodeStore} hiddenPrefix={editor.hiddenScopeCode} />
              </td>
            </tr>
            <tr>
              <td>
                <div className="ts-label">to</div>
              </td>
              <td>
                <ExpressionEditorCellComponent
                  store={editor.toCodeStore}
                  hiddenPrefix={editor.hiddenScopeCode}
                  autoFocus={false}
                />
              </td>
            </tr>
            <tr>
              <td>
                <div className="ts-label">item</div>
              </td>
              <td>
                <input className="ts-input" value={data.item} onChange={(e) => editor.setItem(e.currentTarget.value)} />
              </td>
            </tr>
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  },
);

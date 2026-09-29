import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ForeachHeaderBlockEditorStore } from './foreach-header-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const ForeachHeaderBlockEditorComponent: TBlockEditorView<ForeachHeaderBlockEditorStore> = observer(
  ({ editor }) => {
    const { data } = editor;
    return (
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
                <div className="ts-label">item</div>
              </td>
              <td>
                <input className="ts-input" value={data.item} onChange={(e) => editor.setItem(e.currentTarget.value)} />
              </td>
            </tr>
            <tr>
              <td>
                <div className="ts-label">index</div>
              </td>
              <td>
                <input
                  className="ts-input"
                  value={data.index}
                  onChange={(e) => editor.setIndex(e.currentTarget.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  },
);

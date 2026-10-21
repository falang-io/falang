import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { CreateVarBlockEditorStore } from './create-var-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { VariableTypeSelect } from '../../block-elements/variable-type/variable-type-select.cmp.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

export const CreateVarBlockEditorComponent: TBlockEditorView<CreateVarBlockEditorStore> = observer(({ editor }) => {
  const { data, structTypes } = editor;

  return (
    <TypeScriptBlockContainer>
      <table className="ts-table ts-table--fixed">
        <tbody>
          <tr>
            <td colSpan={2}>
              <input className="ts-input" value={data.name} onChange={(e) => editor.setName(e.currentTarget.value)} />
            </td>
          </tr>
          <VariableTypeSelect
            variant="table"
            value={data.variableType}
            onChange={(next) => next && editor.setVariableType(next)}
            projectService={editor.typePickerProjectService}
            structTypes={structTypes}
          />
          <tr>
            <td>
              <div className="ts-label">value</div>
            </td>
            <td>
              <ExpressionEditorCellComponent
                store={editor.valueCodeStore}
                hiddenPrefix={editor.valueHiddenPrefix}
                autoFocus={false}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

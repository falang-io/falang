import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { CallFunctionBlockEditorStore } from './call-function-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { DynamicTypedFieldsComponent } from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields.cmp.js';

export const CallFunctionBlockEditorComponent: TBlockEditorView<CallFunctionBlockEditorStore> = observer(
  ({ editor }) => {
    const { data } = editor;
    return (
      <TypeScriptBlockContainer>
        <table className="ts-table ts-table--fixed">
          <tbody>
            <tr>
              <td>
                <div className="ts-label">scheme</div>
              </td>
              <td>
                <div className="ts-select-wrapper">
                  <select
                    className="ts-select"
                    value={data.schemeId}
                    onChange={(e) => editor.setSchemeId(e.currentTarget.value)}
                  >
                    <option value="">—</option>
                    {editor.availableFunctions.map((fn) => (
                      <option key={fn.schemeId} value={fn.schemeId}>
                        {fn.name}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
            </tr>
            <DynamicTypedFieldsComponent store={editor.parameters} />
            {editor.targetReturnsValue && (
              <tr>
                <td>
                  <div className="ts-label">result</div>
                </td>
                <td>
                  <input
                    className="ts-input"
                    value={data.returnVariable}
                    onChange={(e) => editor.setReturnVariable(e.currentTarget.value)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  },
);

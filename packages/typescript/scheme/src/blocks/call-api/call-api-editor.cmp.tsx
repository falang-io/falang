import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { CallApiBlockEditorStore } from './call-api-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { DynamicTypedFieldsComponent } from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields.cmp.js';

export const CallApiBlockEditorComponent: TBlockEditorView<CallApiBlockEditorStore> = observer(({ editor }) => {
  const { data } = editor;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table ts-table--fixed">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">api</div>
            </td>
            <td>
              <div className="ts-select-wrapper">
                <select
                  className="ts-select"
                  value={data.schemeId}
                  onChange={(e) => editor.setSchemeId(e.currentTarget.value)}
                >
                  <option value="">—</option>
                  {editor.availableApis.map((api) => (
                    <option key={api.schemeId} value={api.schemeId}>
                      {api.schemeName}
                    </option>
                  ))}
                </select>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">endpoint</div>
            </td>
            <td>
              <div className="ts-select-wrapper">
                <select
                  className="ts-select"
                  value={data.iconId ?? ''}
                  onChange={(e) => editor.setIconId(e.currentTarget.value)}
                >
                  <option value="">—</option>
                  {editor.availableEndpoints.map((endpoint) => (
                    <option key={endpoint.id} value={endpoint.id}>
                      {`${endpoint.apiName} / ${endpoint.name}`}
                    </option>
                  ))}
                </select>
              </div>
            </td>
          </tr>
          <DynamicTypedFieldsComponent store={editor.parameters} />
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
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

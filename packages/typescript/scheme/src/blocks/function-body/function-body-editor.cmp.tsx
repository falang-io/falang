import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_SCHEME, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { FunctionBodyBlockEditorStore } from './function-body-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { VariableTypeSelect } from '../../block-elements/variable-type/variable-type-select.cmp.js';

export const FunctionBodyBlockEditorComponent: TBlockEditorView<FunctionBodyBlockEditorStore> = observer(
  ({ editor }) => {
    const { data, projectService } = editor;
    const scheme = useService(TOKEN_SCHEME);
    const typesRegistry = projectService?.typesRegistry;
    const structTypes = typesRegistry ? [...typesRegistry.types.values()] : [];

    return (
      <TypeScriptBlockContainer>
        <table className="ts-table">
          <tbody>
            <tr>
              <td colSpan={3}>
                <div className="ts-input-value" style={{ opacity: 0.6 }}>
                  {scheme.name || <>&nbsp;</>}
                </div>
              </td>
            </tr>
            {data.parameters.map((param, index) => {
              const paramType = param.type;
              return (
                <>
                  <tr key={`${index}-name`}>
                    <td colSpan={2}>
                      <input
                        className="ts-input"
                        value={param.name}
                        onChange={(e) => editor.setParameterName(index, e.currentTarget.value)}
                        placeholder="name"
                      />
                    </td>
                    <td style={{ width: 20, textAlign: 'center' }}>
                      <button
                        onClick={() => editor.removeParameter(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit',
                          font: 'inherit',
                          padding: '0 4px',
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  <VariableTypeSelect
                    variant="table"
                    colSpan={2}
                    value={paramType}
                    onChange={(next) => next && editor.setParameterVariableType(index, next)}
                    projectService={projectService}
                    structTypes={structTypes}
                  />
                </>
              );
            })}
            <VariableTypeSelect
              variant="table"
              colSpan={2}
              label="returns"
              value={data.returnValue}
              voidIsUndefined
              onChange={(next) => editor.setReturnValueVariableType(next)}
              projectService={projectService}
              structTypes={structTypes}
            />
            <tr>
              <td colSpan={3}>
                <button
                  onClick={() => editor.addParameter()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0 3px',
                  }}
                >
                  + parameter
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  },
);

import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { CreateVarBlockEditorStore } from './create-var-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TsSelect } from '../../cmp/ts-select.js';
import { ExpressionEditorCellComponent } from '../../block-elements/code/expression-editor-cell.cmp.js';

const typeOptions = ['string', 'boolean', 'number', 'array', 'struct', 'void', 'enum', 'any'] as const;
type TTypeOption = (typeof typeOptions)[number];

const elementTypeOptions = ['string', 'boolean', 'number', 'struct', 'void', 'enum', 'any'] as const;
type TElementTypeOption = (typeof elementTypeOptions)[number];

const dimensionsOptions = [1, 2, 3, 4] as const;

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
          <tr>
            <td>
              <div className="ts-label">type</div>
            </td>
            <td>
              <div className="ts-select-wrapper">
                <TsSelect
                  className="ts-select"
                  value={data.variableType.type}
                  onChange={(e) => editor.setType(e.currentTarget.value as TTypeOption)}
                  style={{ width: '100%' }}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </TsSelect>
              </div>
            </td>
          </tr>
          {data.variableType.type === 'array' && (
            <>
              <tr>
                <td>
                  <div className="ts-label">of</div>
                </td>
                <td>
                  <div className="ts-select-wrapper">
                    <TsSelect
                      className="ts-select"
                      value={data.variableType.elementType.type}
                      onChange={(e) => editor.setArrayElementType(e.currentTarget.value as TElementTypeOption)}
                      style={{ width: '100%' }}
                    >
                      {elementTypeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </TsSelect>
                  </div>
                </td>
              </tr>
              {data.variableType.elementType.type === 'struct' && (
                <tr>
                  <td>
                    <div className="ts-label">struct</div>
                  </td>
                  <td>
                    <div className="ts-select-wrapper">
                      <TsSelect
                        className="ts-select"
                        value={data.variableType.elementType.id}
                        onChange={(e) => editor.setArrayElementStructId(e.currentTarget.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">—</option>
                        {structTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name || t.id}
                          </option>
                        ))}
                      </TsSelect>
                    </div>
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  <div className="ts-label">dim</div>
                </td>
                <td>
                  <div className="ts-select-wrapper">
                    <TsSelect
                      className="ts-select"
                      value={data.variableType.dimensions}
                      onChange={(e) => editor.setArrayDimensions(Number(e.currentTarget.value))}
                      style={{ width: '100%' }}
                    >
                      {dimensionsOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </TsSelect>
                  </div>
                </td>
              </tr>
            </>
          )}
          {data.variableType.type === 'struct' && (
            <tr>
              <td>
                <div className="ts-label">struct</div>
              </td>
              <td>
                <div className="ts-select-wrapper">
                  <TsSelect
                    className="ts-select"
                    value={data.variableType.id}
                    onChange={(e) => editor.setStructId(e.currentTarget.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">—</option>
                    {structTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.id}
                      </option>
                    ))}
                  </TsSelect>
                </div>
              </td>
            </tr>
          )}
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

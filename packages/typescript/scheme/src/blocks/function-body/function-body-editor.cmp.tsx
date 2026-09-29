import type { TBlockEditorView } from '@falang/scheme';
import { TOKEN_SCHEME, useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { FunctionBodyBlockEditorStore } from './function-body-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TsSelect } from '../../cmp/ts-select.js';

const typeOptions = ['string', 'boolean', 'number', 'array', 'struct', 'void', 'enum', 'any'] as const;
type TTypeOption = (typeof typeOptions)[number];

const elementTypeOptions = ['string', 'boolean', 'number', 'struct', 'void', 'enum', 'any'] as const;
type TElementTypeOption = (typeof elementTypeOptions)[number];

const dimensionsOptions = [1, 2, 3, 4] as const;

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
                  <tr key={`${index}-type`}>
                    <td>
                      <div className="ts-label">type</div>
                    </td>
                    <td colSpan={2}>
                      <TsSelect
                        value={paramType.type}
                        onChange={(e) => editor.setParameterType(index, e.currentTarget.value as TTypeOption)}
                        style={{ width: '100%' }}
                      >
                        {typeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </TsSelect>
                    </td>
                  </tr>
                  {paramType.type === 'array' && (
                    <>
                      <tr key={`${index}-array-of`}>
                        <td>
                          <div className="ts-label">of</div>
                        </td>
                        <td colSpan={2}>
                          <TsSelect
                            value={paramType.elementType.type}
                            onChange={(e) =>
                              editor.setParameterArrayElementType(index, e.currentTarget.value as TElementTypeOption)
                            }
                            style={{ width: '100%' }}
                          >
                            {elementTypeOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </TsSelect>
                        </td>
                      </tr>
                      {paramType.elementType.type === 'struct' && (
                        <tr key={`${index}-array-struct`}>
                          <td>
                            <div className="ts-label">struct</div>
                          </td>
                          <td colSpan={2}>
                            <TsSelect
                              value={paramType.elementType.id}
                              onChange={(e) => editor.setParameterArrayElementStructId(index, e.currentTarget.value)}
                              style={{ width: '100%' }}
                            >
                              <option value="">—</option>
                              {structTypes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name || t.id}
                                </option>
                              ))}
                            </TsSelect>
                          </td>
                        </tr>
                      )}
                      <tr key={`${index}-array-dim`}>
                        <td>
                          <div className="ts-label">dim</div>
                        </td>
                        <td colSpan={2}>
                          <TsSelect
                            value={paramType.dimensions}
                            onChange={(e) => editor.setParameterArrayDimensions(index, Number(e.currentTarget.value))}
                            style={{ width: '100%' }}
                          >
                            {dimensionsOptions.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </TsSelect>
                        </td>
                      </tr>
                    </>
                  )}
                  {paramType.type === 'struct' && (
                    <tr key={`${index}-struct`}>
                      <td>
                        <div className="ts-label">struct</div>
                      </td>
                      <td colSpan={2}>
                        <TsSelect
                          value={paramType.id}
                          onChange={(e) => editor.setParameterStructId(index, e.currentTarget.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="">—</option>
                          {structTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name || t.id}
                            </option>
                          ))}
                        </TsSelect>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            <tr key="return-type">
              <td>
                <div className="ts-label">returns</div>
              </td>
              <td colSpan={2}>
                <TsSelect
                  value={data.returnValue?.type ?? 'void'}
                  onChange={(e) => editor.setReturnValueType(e.currentTarget.value as TTypeOption)}
                  style={{ width: '100%' }}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </TsSelect>
              </td>
            </tr>
            {data.returnValue?.type === 'array' && (
              <>
                <tr key="return-array-of">
                  <td>
                    <div className="ts-label">of</div>
                  </td>
                  <td colSpan={2}>
                    <TsSelect
                      value={data.returnValue.elementType.type}
                      onChange={(e) =>
                        editor.setReturnValueArrayElementType(e.currentTarget.value as TElementTypeOption)
                      }
                      style={{ width: '100%' }}
                    >
                      {elementTypeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </TsSelect>
                  </td>
                </tr>
                {data.returnValue.elementType.type === 'struct' && (
                  <tr key="return-array-struct">
                    <td>
                      <div className="ts-label">struct</div>
                    </td>
                    <td colSpan={2}>
                      <TsSelect
                        value={data.returnValue.elementType.id}
                        onChange={(e) => editor.setReturnValueArrayElementStructId(e.currentTarget.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">—</option>
                        {structTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name || t.id}
                          </option>
                        ))}
                      </TsSelect>
                    </td>
                  </tr>
                )}
                <tr key="return-array-dim">
                  <td>
                    <div className="ts-label">dim</div>
                  </td>
                  <td colSpan={2}>
                    <TsSelect
                      value={data.returnValue.dimensions}
                      onChange={(e) => editor.setReturnValueArrayDimensions(Number(e.currentTarget.value))}
                      style={{ width: '100%' }}
                    >
                      {dimensionsOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </TsSelect>
                  </td>
                </tr>
              </>
            )}
            {data.returnValue?.type === 'struct' && (
              <tr key="return-struct">
                <td>
                  <div className="ts-label">struct</div>
                </td>
                <td colSpan={2}>
                  <TsSelect
                    value={data.returnValue.id}
                    onChange={(e) => editor.setReturnValueStructId(e.currentTarget.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">—</option>
                    {structTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.id}
                      </option>
                    ))}
                  </TsSelect>
                </td>
              </tr>
            )}
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

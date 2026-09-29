import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { EnumValueTypeVariants, type TEnumTypeVariant } from '@falang/typescript-dto';
import type { EnumHeadBlockEditorStore } from './enum-head-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TsSelect } from '../../cmp/ts-select.js';

export const EnumHeadBlockEditorComponent: TBlockEditorView<EnumHeadBlockEditorStore> = observer(({ editor }) => {
  const { data } = editor;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
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
                  value={data.valueType}
                  onChange={(e) => editor.setValueType(e.currentTarget.value as TEnumTypeVariant)}
                  style={{ width: '100%' }}
                >
                  {EnumValueTypeVariants.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </TsSelect>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

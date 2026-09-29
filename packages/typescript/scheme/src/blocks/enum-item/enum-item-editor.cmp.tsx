import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { EnumItemBlockEditorStore } from './enum-item-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';

export const EnumItemBlockEditorComponent: TBlockEditorView<EnumItemBlockEditorStore> = observer(({ editor }) => {
  const { data } = editor;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <input
                className="ts-input"
                value={data.key}
                placeholder="key"
                onChange={(e) => editor.setKey(e.currentTarget.value)}
              />
            </td>
            <td>
              <input
                className="ts-input"
                value={data.value}
                placeholder="value"
                onChange={(e) => editor.setValue(e.currentTarget.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

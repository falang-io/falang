import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IEnumItem } from './enum-item-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';

export const EnumItemBlockComponent: IBlockView<IEnumItem> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-input-value">{data.key || <>&nbsp;</>}</div>
            </td>
            <td>
              <div className="ts-input-value">{data.value || <>&nbsp;</>}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

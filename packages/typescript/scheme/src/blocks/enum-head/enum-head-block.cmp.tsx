import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IEnumHead } from './enum-head-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';

export const EnumHeadBlockComponent: IBlockView<IEnumHead> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td colSpan={2}>
              <div className="ts-input-value">{data.name || <>&nbsp;</>}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">type</div>
            </td>
            <td>{data.valueType}</td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

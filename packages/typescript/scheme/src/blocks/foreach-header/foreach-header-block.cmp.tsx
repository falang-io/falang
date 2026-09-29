import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IForeachHeader } from './foreach-header-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';

export const ForeachHeaderBlockComponent: IBlockView<IForeachHeader> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">arr</div>
            </td>
            <td>
              <CodeViewComponent value={data.arr} />
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">item</div>
            </td>
            <td>
              <div className="ts-input-value">{data.item || <>&nbsp;</>}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">index</div>
            </td>
            <td>
              <div className="ts-input-value">{data.index || <>&nbsp;</>}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

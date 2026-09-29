import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IFromToCycleHeader } from './from-to-cycle-header-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';

export const FromToCycleHeaderBlockComponent: IBlockView<IFromToCycleHeader> = observer(({ data }) => {
  if (!data) return <div>&nbsp;</div>;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">from</div>
            </td>
            <td>
              <CodeViewComponent value={data.from} />
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">to</div>
            </td>
            <td>
              <CodeViewComponent value={data.to} />
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
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IArrOpReturning } from './arr-op-returning-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';

export const ArrOpReturningBlockComponent: IBlockView<IArrOpReturning> = observer(({ data }) => {
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
              <div className="ts-label">var</div>
            </td>
            <td>
              <div className="ts-input-value">{data.variable || <>&nbsp;</>}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IArrInsert } from './arr-insert-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';

export const ArrInsertBlockComponent: IBlockView<IArrInsert> = observer(({ data }) => {
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
              <div className="ts-label">start</div>
            </td>
            <td>
              <CodeViewComponent value={data.start} />
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">insert</div>
            </td>
            <td>
              <CodeViewComponent value={data.insertArr} />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

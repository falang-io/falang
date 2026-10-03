import type { IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IArrOpInput } from './arr-op-input-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { CodeViewComponent } from '../../block-elements/code/code.view.cmp.js';
import { TemplateStringViewComponent } from '../../block-elements/template-string/template-string-view.cmp.js';
import { stringLiteralText } from '../../block-elements/template-string/string-value-expression.js';

/** A string/template literal value reads as text, the same way the editor shows it for an array of strings. */
const ValueView: React.FC<{ value: string }> = ({ value }) => {
  const text = stringLiteralText(value);
  return text === null ? <CodeViewComponent value={value} /> : <TemplateStringViewComponent value={text} />;
};

export const ArrOpInputBlockComponent: IBlockView<IArrOpInput> = observer(({ data }) => {
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
              <div className="ts-label">value</div>
            </td>
            <td>
              <ValueView value={data.value} />
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

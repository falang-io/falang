import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ICallFunction } from './call-function-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { DynamicTypedFieldsViewComponent } from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields-view.cmp.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { FunctionsRegistryStore } from '../../typescript-project-service/functions-registry.store.js';

export const CallFunctionBlockComponent: IBlockView<ICallFunction> = observer(({ data }) => {
  let functionsRegistry: FunctionsRegistryStore | null = null;
  try {
    functionsRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).functionsRegistry;
  } catch {
    // service not registered
  }

  if (!data) return <div>&nbsp;</div>;
  const target = functionsRegistry?.functions.get(data.schemeId);
  const targetReturnValue = target?.returnValue;
  const targetReturnsValue = Boolean(targetReturnValue) && targetReturnValue?.type !== 'void';
  const fields = data.parameters.map((value, index) => ({
    label: target?.parameters[index]?.name ?? `#${index + 1}`,
    value,
  }));

  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">scheme</div>
            </td>
            <td>
              <div className="ts-input-value">{target?.name || data.schemeId || <>&nbsp;</>}</div>
            </td>
          </tr>
          <DynamicTypedFieldsViewComponent fields={fields} />
          {targetReturnsValue && (
            <tr>
              <td>
                <div className="ts-label">result</div>
              </td>
              <td>
                <div className="ts-input-value">{data.returnVariable || <>&nbsp;</>}</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ICallApi } from './call-api-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { DynamicTypedFieldsViewComponent } from '../../block-elements/dynamic-typed-fields/dynamic-typed-fields-view.cmp.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { ExternalApiRegistryStore } from '../../typescript-project-service/external-api-registry.store.js';

export const CallApiBlockComponent: IBlockView<ICallApi> = observer(({ data }) => {
  let externalApiRegistry: ExternalApiRegistryStore | null = null;
  try {
    externalApiRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).externalApiRegistry;
  } catch {
    // service not registered
  }

  if (!data) return <div>&nbsp;</div>;
  const targetEndpoint = externalApiRegistry?.endpoints.get(data.iconId ?? '');
  const schemeName =
    targetEndpoint?.schemeName ??
    Array.from(externalApiRegistry?.apis.values() ?? []).find((api) => api.schemeId === data.schemeId)?.schemeName;
  const fields = data.parameters.map((value, index) => ({
    label: targetEndpoint?.parameters[index]?.name ?? `#${index + 1}`,
    value,
  }));

  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-label">api</div>
            </td>
            <td>
              <div className="ts-input-value">{schemeName || data.schemeId || <>&nbsp;</>}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">endpoint</div>
            </td>
            <td>
              <div className="ts-input-value">
                {targetEndpoint ? `${targetEndpoint.apiName} / ${targetEndpoint.name}` : data.iconId || <>&nbsp;</>}
              </div>
            </td>
          </tr>
          <DynamicTypedFieldsViewComponent fields={fields} />
          <tr>
            <td>
              <div className="ts-label">result</div>
            </td>
            <td>
              <div className="ts-input-value">{data.returnVariable || <>&nbsp;</>}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

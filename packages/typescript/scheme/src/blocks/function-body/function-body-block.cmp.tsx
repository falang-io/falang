import { TOKEN_SCHEME, useService, type IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { variableInfoToTsType } from '@falang/typescript-dto';
import type { IfunctionBody, IfunctionBodyParameter } from './function-body-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypesRegistryStore } from '../../typescript-project-service/types-registry.store.js';

const formatParamType = (param: IfunctionBodyParameter, getStructName: (id: string) => string): string => {
  const t = param.type;
  if (t.type === 'array') {
    const elemLabel = t.elementType.type === 'struct' ? getStructName(t.elementType.id) : t.elementType.type;
    const dimLabel = t.dimensions > 1 ? `[${t.dimensions}]` : '';
    return `${elemLabel}[]${dimLabel}`;
  }
  if (t.type === 'struct') {
    return getStructName(t.id) || t.id || 'struct';
  }
  return t.type;
};

export const FunctionBodyBlockComponent: IBlockView<IfunctionBody> = observer(({ data }) => {
  const scheme = useService(TOKEN_SCHEME);
  let typesRegistry: TypesRegistryStore | null = null;
  try {
    typesRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).typesRegistry;
  } catch {
    // service not registered
  }

  const getStructName = (id: string): string => typesRegistry?.types.get(id)?.name ?? id;

  if (!data) return <div>&nbsp;</div>;

  const structNames = new Map<string, string>(
    typesRegistry ? Array.from(typesRegistry.types, ([id, item]) => [id, item.name]) : [],
  );
  const returnTypeLabel = variableInfoToTsType(data.returnValue ?? { type: 'void' }, structNames);

  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td>
              <div className="ts-input-value">{scheme.name || <>&nbsp;</>}</div>
            </td>
            <td>
              <div className="ts-label">{returnTypeLabel}</div>
            </td>
          </tr>
          {data.parameters.map((param, i) => (
            <tr key={i}>
              <td>
                <div className="ts-input-value">{param.name || <>&nbsp;</>}</div>
              </td>
              <td>
                <div className="ts-label">{formatParamType(param, getStructName)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

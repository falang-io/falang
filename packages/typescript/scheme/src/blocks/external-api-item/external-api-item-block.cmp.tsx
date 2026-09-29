import { useService, type IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IExternalApiItem, IExternalApiItemParameter } from './external-api-item-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypesRegistryStore } from '../../typescript-project-service/types-registry.store.js';

/**
 * Same param-type formatting as `function-body-block.cmp.tsx`'s own `formatParamType` — duplicated
 * per this package's existing per-block-kind duplication convention (see
 * `external-api-item-editor.store.ts`'s `defaultVariableType` comment for the established precedent).
 */
const formatParamType = (param: IExternalApiItemParameter, getStructName: (id: string) => string): string => {
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

const formatReturnLabel = (
  returnValue: IExternalApiItem['returnValue'],
  getStructName: (id: string) => string,
): string => {
  if (!returnValue) return 'void';
  if (returnValue.type === 'struct') return getStructName(returnValue.id) || returnValue.id || 'struct';
  return returnValue.type;
};

/**
 * A method's own signature — name and return type — rendered as a compact table (method name as a
 * spanning header row, then one row per parameter: name/type), the same `ts-table`/`ts-label`/
 * `ts-input-value` shape `function-body-block.cmp.tsx`/`create-var-block.cmp.tsx`/
 * `object-property-block.cmp.tsx` already use, rather than the single joined string this block used
 * to render. `getStructName` resolves a `struct`-typed parameter/return value to its real struct name
 * via `TypesRegistryStore` (falling back to the raw id when the registry hasn't seen that struct yet
 * — e.g. its defining document was never opened; a separate, pre-existing gap in how the registry is
 * populated project-wide, not something this component can or should fix).
 */
export const ExternalApiItemBlockComponent: IBlockView<IExternalApiItem> = observer(({ data }) => {
  let typesRegistry: TypesRegistryStore | null = null;
  try {
    typesRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).typesRegistry;
  } catch {
    // service not registered
  }

  const getStructName = (id: string): string => typesRegistry?.types.get(id)?.name ?? id;

  if (!data) return <div>&nbsp;</div>;

  const returnLabel = formatReturnLabel(data.returnValue, getStructName);

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
              <div className="ts-label">returns</div>
            </td>
            <td>
              <div className="ts-label">{returnLabel}</div>
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

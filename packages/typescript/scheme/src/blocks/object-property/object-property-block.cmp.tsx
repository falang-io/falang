import type { IBlockView } from '@falang/scheme';
import { useService } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { IObjectProperty } from './object-property-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import type { TypesRegistryStore } from '../../typescript-project-service/types-registry.store.js';

/**
 * Shared by both `create-var` (a standalone statement in a function body) and struct-field `property`
 * nodes (`objects-structure-scheme-factory.ts`) — only the former is registered with a `title` (see
 * `functional.ts`), since a struct field is a row of its parent object, not its own labeled statement.
 */
export const ObjectPropertyBlockComponent: IBlockView<IObjectProperty> = observer(({ data }) => {
  let typesRegistry: TypesRegistryStore | null = null;
  try {
    typesRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).typesRegistry;
  } catch {
    // service not registered
  }

  const getStructName = (id: string): string => typesRegistry?.types.get(id)?.name ?? id;

  if (!data) return <div>&nbsp;</div>;
  const { name, variableType } = data;
  return (
    <TypeScriptBlockContainer>
      <table className="ts-table">
        <tbody>
          <tr>
            <td colSpan={2}>
              <div className="ts-input-value">{name || <>&nbsp;</>}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="ts-label">type</div>
            </td>
            <td>{variableType.type}</td>
          </tr>
          {variableType.type === 'array' && (
            <>
              <tr>
                <td>
                  <div className="ts-label">of</div>
                </td>
                <td>{variableType.elementType.type}</td>
              </tr>
              {variableType.elementType.type === 'struct' && (
                <tr>
                  <td>
                    <div className="ts-label">struct</div>
                  </td>
                  <td>{getStructName(variableType.elementType.id) || variableType.elementType.id || '—'}</td>
                </tr>
              )}
              {variableType.dimensions > 1 && (
                <tr>
                  <td>
                    <div className="ts-label">dim</div>
                  </td>
                  <td>{variableType.dimensions}</td>
                </tr>
              )}
            </>
          )}
          {variableType.type === 'struct' && (
            <tr>
              <td>
                <div className="ts-label">struct</div>
              </td>
              <td>{getStructName(variableType.id) || variableType.id || '—'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </TypeScriptBlockContainer>
  );
});

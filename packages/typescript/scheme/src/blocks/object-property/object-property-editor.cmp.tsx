import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ObjectPropertyBlockEditorStore } from './object-property-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';
import { VariableTypeSelect } from '../../block-elements/variable-type/variable-type-select.cmp.js';

export const ObjectPropertyBlockEditorComponent: TBlockEditorView<ObjectPropertyBlockEditorStore> = observer(
  ({ editor }) => {
    const { data, projectService } = editor;
    const typesRegistry = projectService?.typesRegistry;
    const structTypes = typesRegistry ? [...typesRegistry.types.values()] : [];

    return (
      <TypeScriptBlockContainer>
        <table className="ts-table">
          <tbody>
            <tr>
              <td colSpan={2}>
                <input className="ts-input" value={data.name} onChange={(e) => editor.setName(e.currentTarget.value)} />
              </td>
            </tr>
            <VariableTypeSelect
              variant="table"
              value={data.variableType}
              onChange={(next) => next && editor.setVariableType(next)}
              projectService={projectService}
              structTypes={structTypes}
            />
          </tbody>
        </table>
      </TypeScriptBlockContainer>
    );
  },
);

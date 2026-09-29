import { observer } from 'mobx-react-lite';
import type { DynamicTypedFieldsStore } from './dynamic-typed-fields.store.js';
import { ExpressionEditorCellComponent } from '../code/expression-editor-cell.cmp.js';

export interface IDynamicTypedFieldsComponentProps {
  store: DynamicTypedFieldsStore;
}

/** Renders one labeled `ExpressionEditorCellComponent` row per field currently in `store.fields`. */
export const DynamicTypedFieldsComponent: React.FC<IDynamicTypedFieldsComponentProps> = observer(({ store }) => (
  <>
    {store.fields.map(({ descriptor, store: fieldStore }) => (
      <tr key={descriptor.key}>
        <td>
          <div className="ts-label">{descriptor.label}</div>
        </td>
        <td>
          <ExpressionEditorCellComponent store={fieldStore} hiddenPrefix={fieldStore.hiddenPrefix} autoFocus={false} />
        </td>
      </tr>
    ))}
  </>
));

import { observer } from 'mobx-react-lite';
import { CodeViewComponent } from '../code/code.view.cmp.js';

export interface IDynamicTypedFieldsViewComponentProps {
  /** Labeled values to display, e.g. resolved parameter names paired with their argument expressions. */
  fields: readonly { readonly label: string; readonly value: string }[];
}

/** Read-only counterpart to `DynamicTypedFieldsComponent`: one labeled `CodeViewComponent` row per field. */
export const DynamicTypedFieldsViewComponent: React.FC<IDynamicTypedFieldsViewComponentProps> = observer(
  ({ fields }) => (
    <>
      {fields.map((field, index) => (
        <tr key={index}>
          <td>
            <div className="ts-label">{field.label}</div>
          </td>
          <td>
            <CodeViewComponent value={field.value} />
          </td>
        </tr>
      ))}
    </>
  ),
);

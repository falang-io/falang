import type { IBlockView } from '@falang/scheme';
import { TOKEN_I18N, useService } from '@falang/scheme';
import { CodeViewComponent, TemplateStringViewComponent, TypeScriptBlockContainer } from '@falang/typescript-scheme';
import type { IFieldConfig } from '@falang/workflow-integrations-common';
import { observer } from 'mobx-react-lite';
import { TOKEN_CREDENTIALS_PROVIDER, TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';
import type { TIntegrationActionData } from './integration-action-editor.store.js';

/** Read-only counterpart to `FieldEditorComponent`/`SidebarFieldEditorComponent` — same per-kind split, Prism-highlighted for code-shaped kinds. */
const FieldValueComponent: React.FC<{ field: IFieldConfig; value: string; credentialNames: Map<string, string> }> = ({
  field,
  value,
  credentialNames,
}) => {
  if (field.kind === 'credential-ref') return <>{credentialNames.get(value) ?? value}</>;
  if (field.kind === 'template-string') return <TemplateStringViewComponent value={value} />;
  if (field.kind === 'expression') return <CodeViewComponent value={value} />;
  return <>{value}</>;
};

export const IntegrationActionBlockComponent: IBlockView<TIntegrationActionData> = observer(({ data, icon }) => {
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  const credentialsProvider = useService(TOKEN_CREDENTIALS_PROVIDER);
  const t = useService(TOKEN_I18N).t;
  const descriptor = registry.findAction(icon.name);
  if (!descriptor || !data) return <div>&nbsp;</div>;
  const credentialNames = new Map(credentialsProvider.getInstances().map((instance) => [instance.id, instance.name]));
  return (
    <TypeScriptBlockContainer>
      <div className="workflow-integration-block">
        <table className="ts-table">
          <tbody>
            {descriptor.fields.map((field) => (
              <tr key={field.name}>
                <td>
                  <div className="ts-label">{t(field.label)}</div>
                </td>
                <td>
                  <FieldValueComponent field={field} value={data[field.name] ?? ''} credentialNames={credentialNames} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TypeScriptBlockContainer>
  );
});

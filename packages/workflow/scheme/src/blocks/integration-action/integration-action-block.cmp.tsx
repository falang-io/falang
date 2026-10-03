import type { IBlockView } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { TOKEN_I18N, TOKEN_SCHEME, useService } from '@falang/scheme';
import {
  CodeViewComponent,
  TemplateStringViewComponent,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
  TypeScriptBlockContainer,
} from '@falang/typescript-scheme';
import type { IFieldConfig } from '@falang/workflow-integrations-common';
import { observer } from 'mobx-react-lite';
import { TOKEN_CREDENTIALS_PROVIDER, TOKEN_INTEGRATIONS_REGISTRY } from '../../registry/di-tokens.js';
import type { TIntegrationActionData } from './integration-action-editor.store.js';
import { describeResultType } from './describe-result-type.js';

/** Read-only counterpart to `FieldEditorComponent`/`SidebarFieldEditorComponent` — same per-kind split, Prism-highlighted for code-shaped kinds. */
const FieldValueComponent: React.FC<{
  field: IFieldConfig;
  value: string;
  credentialNames: Map<string, string>;
  getStructName: (id: string) => string | null | undefined;
}> = ({ field, value, credentialNames, getStructName }) => {
  const t = useService(TOKEN_I18N).t;
  if (field.kind === 'result-type') return <>{describeResultType(value, t, getStructName)}</>;
  if (field.kind === 'credential-ref') return <>{credentialNames.get(value) ?? value}</>;
  if (field.kind === 'template-string') return <TemplateStringViewComponent value={value} />;
  if (field.kind === 'expression') return <CodeViewComponent value={value} />;
  return <>{value}</>;
};

/** Project struct display names for a `result-type` field; empty lookup when the scheme has no TypeScript project service. */
const useStructNameGetter = (): ((id: string) => string | null | undefined) => {
  const scheme = useService(TOKEN_SCHEME);
  return (id) => {
    try {
      return resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, scheme.container).typesRegistry.types.get(id)?.name;
    } catch {
      // No TypeScript project service registered (bare test harness).
      return null;
    }
  };
};

export const IntegrationActionBlockComponent: IBlockView<TIntegrationActionData> = observer(({ data, icon }) => {
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  const credentialsProvider = useService(TOKEN_CREDENTIALS_PROVIDER);
  const t = useService(TOKEN_I18N).t;
  const getStructName = useStructNameGetter();
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
                  <FieldValueComponent
                    field={field}
                    value={data[field.name] ?? ''}
                    credentialNames={credentialNames}
                    getStructName={getStructName}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TypeScriptBlockContainer>
  );
});

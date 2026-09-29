import { zod, type IDocumentCustomConfig } from '@falang/dto';
import type { IFieldConfig, IWorkflowIntegration } from './types.js';

/** The pinned, project-root document holding every configured credential instance — see ADR 0006. */
export const INTEGRATIONS_DOCUMENT_TYPE = 'integrations';

/**
 * Echoed back by the client for a `secret`-kind field whose value the user didn't change — see
 * `IntegrationsEditor`'s `instanceToFormValues`, which pre-fills the edit form from whatever the
 * server returned. Never a real secret value itself, so it doubles as the read-path mask and the
 * write-path "keep the existing encrypted value" signal (`credentials-codec.ts`) and, client-side, as
 * an "is this field actually set?" check (e.g. an OAuth2 "Connected" indicator).
 */
export const SECRET_MASK = '••••••••';

export interface IEnvironmentValue {
  readonly dev: string;
  readonly prod: string;
}

const environmentValueSchema: zod.ZodType<IEnvironmentValue> = zod.object({
  dev: zod.string(),
  prod: zod.string(),
});

/**
 * `secret`-kind fields are dev/prod pairs (see ADR 0006's "Dev/prod credential separation") — every
 * other field kind is a single value, since only secrets carry the "which external registration is
 * this" distinction that dev/prod splitting exists for.
 */
const fieldValueSchema = (field: IFieldConfig): zod.ZodType<IEnvironmentValue | string> =>
  field.kind === 'secret' ? environmentValueSchema : zod.string();

export interface IIntegrationInstance {
  readonly id: string;
  readonly vendor: string;
  readonly name: string;
  readonly fields: Readonly<Record<string, IEnvironmentValue | string>>;
}

export interface IIntegrationsDocumentData {
  readonly instances: readonly IIntegrationInstance[];
}

const buildInstanceSchema = (integration: IWorkflowIntegration): zod.ZodType<IIntegrationInstance> => {
  const shape: Record<string, zod.ZodType<IEnvironmentValue | string>> = {};
  for (const field of integration.credentialFields) shape[field.name] = fieldValueSchema(field);
  return zod.object({
    id: zod.string(),
    vendor: zod.literal(integration.vendor),
    name: zod.string(),
    fields: zod.object(shape),
  });
};

const buildInstanceUnionSchema = (instanceSchemas: readonly zod.ZodType[]): zod.ZodType => {
  if (instanceSchemas.length === 0) return zod.never();
  if (instanceSchemas.length === 1) return instanceSchemas[0];
  return zod.union(instanceSchemas as [zod.ZodType, zod.ZodType, ...zod.ZodType[]]);
};

export const buildIntegrationsDocumentSchema = (
  integrations: readonly IWorkflowIntegration[],
): zod.ZodType<IIntegrationsDocumentData> => {
  const instanceSchemas = integrations.map((integration) => buildInstanceSchema(integration));
  const instanceSchema = buildInstanceUnionSchema(instanceSchemas);
  return zod.object({ instances: zod.array(instanceSchema) }) as zod.ZodType<IIntegrationsDocumentData>;
};

export const buildIntegrationsDocumentConfig = (
  integrations: readonly IWorkflowIntegration[],
): IDocumentCustomConfig<IIntegrationsDocumentData> => ({
  typeName: INTEGRATIONS_DOCUMENT_TYPE,
  type: 'custom',
  data: { instances: [] },
  dataZod: buildIntegrationsDocumentSchema(integrations),
});

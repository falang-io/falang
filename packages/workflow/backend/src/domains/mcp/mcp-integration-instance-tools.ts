import { randomUUID } from 'node:crypto';
import { zod } from '@falang/dto';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  supportsBuiltInProvider,
  type IEnvironmentValue,
  type IFieldConfig,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AiProviderSettingsService } from '../admin/app-settings/ai-provider-settings.service.js';
import type { DocumentsService } from '../projects/documents/documents.service.js';
import { assertMcpProjectScope, type IMcpAuthContext } from './mcp-auth.js';
import { registerLooseTool } from './mcp-register-tool.js';
import { errorResult, okResult, withToolErrors } from './mcp-tool-result.js';

export interface IMcpIntegrationInstanceToolsDeps {
  readonly documentsService: Pick<DocumentsService, 'listFull' | 'update'>;
  readonly aiProviderSettings: Pick<AiProviderSettingsService, 'getPublicStatus'>;
  /** Every vendor a project can use right now (static + configured ActivePieces pieces). */
  readonly getIntegrations: () => Promise<readonly IWorkflowIntegration[]>;
}

export const CREATE_INTEGRATION_INSTANCE_DESCRIPTION =
  'Creates a credential instance (an entry of the project\'s pinned "Integrations" document) for a vendor and ' +
  'returns its id. `fields` is optional, wholly or per field: anything left out is created blank (an empty string, ' +
  'or {dev, prod} both empty for a secret field) for the user to fill in through the integrations editor. ' +
  '`platformProvider: true` (openai, the vendors list_integrations marks `builtInProvider`) runs the instance on ' +
  "the deployment's built-in AI provider: no endpoint or API key is needed (leave them empty), the calls are paid " +
  "from the project owner's balance, and only text and choice actions are supported. It is refused when the " +
  'deployment has no built-in provider configured.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildFieldValue = (field: IFieldConfig, provided: unknown): IEnvironmentValue | string => {
  if (field.kind === 'secret') {
    return {
      dev: isRecord(provided) && typeof provided.dev === 'string' ? provided.dev : '',
      prod: isRecord(provided) && typeof provided.prod === 'string' ? provided.prod : '',
    };
  }
  return typeof provided === 'string' ? provided : '';
};

/**
 * Builds a new instance, or explains why not. `platformProvider` needs a vendor that declares `builtInProvider`
 * and a configured built-in provider (ADR 0081 (private)); the integrations codec re-checks the vendor on write.
 */
export const buildMcpIntegrationInstance = (
  input: { vendor: string; name: string; fields?: unknown; platformProvider?: boolean },
  integration: IWorkflowIntegration | undefined,
  aiProviderConfigured: boolean,
  createId: () => string = randomUUID,
): { ok: true; instance: IIntegrationInstance } | { ok: false; error: string } => {
  if (!integration) return { ok: false, error: `Unknown vendor "${input.vendor}" — see list_integrations.` };
  if (input.platformProvider === true) {
    if (!supportsBuiltInProvider(integration)) {
      return { ok: false, error: `Vendor "${input.vendor}" cannot use the built-in AI provider.` };
    }
    if (!aiProviderConfigured) {
      return { ok: false, error: 'The built-in AI provider is not configured on this deployment.' };
    }
  }
  const provided = isRecord(input.fields) ? input.fields : {};
  const fields: Record<string, IEnvironmentValue | string> = {};
  for (const field of integration.credentialFields) fields[field.name] = buildFieldValue(field, provided[field.name]);
  return {
    ok: true,
    instance: {
      fields,
      id: createId(),
      name: input.name,
      vendor: integration.vendor,
      ...(input.platformProvider === true ? { platformProvider: true as const } : {}),
    },
  };
};

/** `create_integration_instance` — the MCP counterpart of the in-app agent's tool of the same name. */
export const registerMcpIntegrationInstanceTools = (
  server: McpServer,
  deps: IMcpIntegrationInstanceToolsDeps,
  getAuth: () => IMcpAuthContext,
): void => {
  registerLooseTool(
    server,
    'create_integration_instance',
    {
      description: CREATE_INTEGRATION_INSTANCE_DESCRIPTION,
      inputSchema: zod.object({
        projectId: zod.string(),
        vendor: zod.string(),
        name: zod.string().min(1),
        fields: zod.record(zod.string(), zod.unknown()).optional(),
        platformProvider: zod.boolean().optional(),
      }),
    },
    withToolErrors(
      async (args: {
        projectId: string;
        vendor: string;
        name: string;
        fields?: unknown;
        platformProvider?: boolean;
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, args.projectId);
        const integrations = await deps.getIntegrations();
        const integration = integrations.find((item) => item.vendor === args.vendor);
        const status = args.platformProvider === true ? await deps.aiProviderSettings.getPublicStatus() : null;
        const configured = status?.configured === true;
        const built = buildMcpIntegrationInstance(args, integration, configured);
        if (!built.ok) return errorResult(built.error);

        const documents = await deps.documentsService.listFull(args.projectId, auth.user.id);
        const document = documents.find((item) => item.type === INTEGRATIONS_DOCUMENT_TYPE);
        if (!document) return errorResult(`Project "${args.projectId}" has no integrations document`);
        const data = (document.data as IIntegrationsDocumentData | null) ?? { instances: [] };
        // Other instances come back masked; the codec keeps their stored secrets for a masked value.
        await deps.documentsService.update(args.projectId, auth.user.id, document.id, {
          data: { instances: [...(data.instances ?? []), built.instance] },
        });
        return okResult({ instanceId: built.instance.id });
      },
    ),
  );
};

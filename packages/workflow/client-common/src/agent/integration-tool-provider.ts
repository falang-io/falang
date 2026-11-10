import type { ILlmToolCall, ILlmToolDefinition, TToolExecutionResult } from '@falang/agent';
import type { IAgentToolProvider } from '@falang/agent';
import {
  supportsBuiltInProvider,
  type IEnvironmentValue,
  type IFieldConfig,
  type IIntegrationInstance,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { generateUuid } from '../generate-uuid.js';
import { getIntegrationInstances } from '../integration-instances.js';
import { getEnabledIntegrations } from '../disabled-vendors.js';
import { builtInAiProviderOf, sandboxVendorsOf } from './sandbox-vendors.js';
import { searchIntegrations } from './integration-catalog.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

/** A field left out of `fields` (or wholly absent) is created blank — the intended flow (ADR 0034
 *  Decision 3) is the agent wiring up the infrastructure a request needs with a credential left
 *  blank, then telling the user it needs filling in. */
const buildFieldValue = (field: IFieldConfig, provided: unknown): IEnvironmentValue | string => {
  if (field.kind === 'secret') {
    const record = asRecord(provided);
    return {
      dev: record && typeof record.dev === 'string' ? record.dev : '',
      prod: record && typeof record.prod === 'string' ? record.prod : '',
    };
  }
  return typeof provided === 'string' ? provided : '';
};

export const DEV_SANDBOX_PROPERTY = {
  type: 'boolean',
  description:
    "Messenger vendors with a platform test bot only: run the dev stand through the platform's bot, so the " +
    "token's dev value may stay empty (the user links their chat in the integration editor). Prod is unaffected.",
} as const;

export const PLATFORM_PROVIDER_PROPERTY = {
  type: 'boolean',
  description:
    "AI vendors that support the deployment's built-in AI provider (openai) only, and only when the runtime notes " +
    'say it is available: calls go through the built-in provider, so leave the endpoint and API key fields empty ' +
    "(dev and prod). Its calls are paid from the project owner's balance. Supports text and choice actions only.",
} as const;

const TOOLS: readonly ILlmToolDefinition[] = [
  {
    name: 'search_integrations',
    description:
      'Read-only. Finds integration vendors (Telegram, AI/LLM providers, CRMs, marketplaces, payments, HTTP, ' +
      '…) by English keywords and returns, for each match: `vendor`, `notes` (what it is/does), ' +
      '`credentialFields` (name, kind — for create_integration_instance), `triggers` (name, notes — read them ' +
      'before picking one — and contextFields, for create_trigger_document) and `nodeKinds` (the node kinds ' +
      'it adds to a function body; get_node_kinds lists them once the project has an instance of this ' +
      'vendor). Pass every relevant keyword at once, including synonyms and product names, e.g. ' +
      '["telegram", "bot", "ai", "llm", "gpt"] for an AI-driven Telegram bot — a vendor matches when any ' +
      'keyword occurs in its description, best matches first. Omit keywords only to get a compact list of ' +
      'every vendor (vendor + notes only).',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'list_integration_instances',
    description:
      'Read-only. Lists existing credential instances (id, vendor, name; devSandbox / platformProvider when set) — ' +
      'field values/secrets are never included, so an existing instance can be reused without ever seeing its ' +
      'credentials.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_integration_instance',
    description:
      'Creates a new credential instance for a vendor and returns its id. `fields` is optional, wholly or per ' +
      'field — anything left out is created blank (an empty string, or {dev,prod} both empty for a secret ' +
      'field) for the user to fill in later through the integrations editor.',
    inputSchema: {
      type: 'object',
      properties: {
        vendor: { type: 'string' },
        name: { type: 'string' },
        fields: { type: 'object' },
        devSandbox: DEV_SANDBOX_PROPERTY,
        platformProvider: PLATFORM_PROVIDER_PROPERTY,
      },
      required: ['vendor', 'name'],
    },
  },
];

/**
 * `IAgentToolProvider` for the project's `integrations` document (ADR 0034 §5, Decision 3) — the
 * agent can search vendors (credential fields, triggers, node kinds — `search_integrations`), list existing instances (never secrets), and create a new
 * instance with blank/partial fields. No `Scheme` involved (the `integrations` document is
 * `type: 'custom'`, edited via `IntegrationsEditor`'s antd form, not a node tree), so `AgentSession`
 * gives these no focus/pause/undo-group treatment — writes go through the same
 * `WorkflowStore.saveIntegrationInstance`/`ProjectSync`-backed autosave the human form already uses.
 */
export class IntegrationToolProvider implements IAgentToolProvider {
  readonly tools = TOOLS;

  private readonly store: IWorkflowAgentStore;

  constructor(store: IWorkflowAgentStore) {
    this.store = store;
  }

  execute(call: ILlmToolCall): TToolExecutionResult {
    switch (call.name) {
      case 'search_integrations': {
        return ok(JSON.stringify(searchIntegrations(getEnabledIntegrations(), asRecord(call.input)?.keywords)));
      }
      case 'list_integration_instances': {
        return this.listIntegrationInstances();
      }
      case 'create_integration_instance': {
        return this.createIntegrationInstance(call.input);
      }
      default: {
        return fail(`Unknown tool: ${call.name}`);
      }
    }
  }

  private listIntegrationInstances(): TToolExecutionResult {
    const instances = getIntegrationInstances(this.store.documents).map(
      ({ id, name, vendor, devSandbox, platformProvider }) => {
        const entry: Record<string, unknown> = { id, name, vendor };
        if (devSandbox) entry.devSandbox = true;
        if (platformProvider) entry.platformProvider = true;
        return entry;
      },
    );
    return ok(JSON.stringify(instances));
  }

  /** `platformProvider` (ADR 0081 (private)): a boolean, and `true` only on a capable vendor with the provider configured. */
  private checkPlatformProvider(
    params: Record<string, unknown>,
    integration: Pick<IWorkflowIntegration, 'vendor' | 'builtInProvider'>,
  ): string | null {
    if ('platformProvider' in params && typeof params.platformProvider !== 'boolean') {
      return 'create_integration_instance: platformProvider must be a boolean';
    }
    if (params.platformProvider !== true) return null;
    if (!supportsBuiltInProvider(integration)) {
      return `create_integration_instance: vendor "${integration.vendor}" cannot use the built-in AI provider, platformProvider is not allowed`;
    }
    if (!builtInAiProviderOf(this.store)) {
      return 'create_integration_instance: the built-in AI provider is not configured on this deployment';
    }
    return null;
  }

  private createIntegrationInstance(input: unknown): TToolExecutionResult {
    const params = asRecord(input);
    if (!params) return fail('create_integration_instance: invalid input');
    const vendor = typeof params.vendor === 'string' ? params.vendor : null;
    const name = typeof params.name === 'string' ? params.name : null;
    if (!vendor || !name) return fail('create_integration_instance: vendor and name are required');

    const integration = getEnabledIntegrations().find((item) => item.vendor === vendor);
    if (!integration) return fail(`create_integration_instance: unknown vendor "${vendor}"`);

    const fieldsInput = asRecord(params.fields) ?? {};
    const fields: Record<string, IEnvironmentValue | string> = {};
    for (const field of integration.credentialFields) {
      fields[field.name] = buildFieldValue(field, fieldsInput[field.name]);
    }

    if ('devSandbox' in params && typeof params.devSandbox !== 'boolean') {
      return fail('create_integration_instance: devSandbox must be a boolean');
    }
    const devSandbox = params.devSandbox === true;
    if (devSandbox) {
      if (!integration.sandbox) {
        return fail(
          `create_integration_instance: vendor "${vendor}" has no platform test bot, devSandbox is not allowed`,
        );
      }
      if (!sandboxVendorsOf(this.store).includes(vendor)) {
        return fail(
          `create_integration_instance: the platform test bot for "${vendor}" is not configured on this deployment`,
        );
      }
    }

    const platformProviderError = this.checkPlatformProvider(params, integration);
    if (platformProviderError) return fail(platformProviderError);
    const platformProvider = params.platformProvider === true;

    const instance: IIntegrationInstance = {
      fields,
      id: generateUuid(),
      name,
      vendor,
      ...(devSandbox ? { devSandbox } : {}),
      ...(platformProvider ? { platformProvider: true as const } : {}),
    };
    this.store.saveIntegrationInstance(instance);
    return ok(JSON.stringify({ instanceId: instance.id }));
  }
}

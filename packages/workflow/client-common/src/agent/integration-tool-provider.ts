import type { ILlmToolCall, ILlmToolDefinition, TToolExecutionResult } from '@falang/agent';
import type { IAgentToolProvider } from '@falang/agent';
import type { IEnvironmentValue, IFieldConfig, IIntegrationInstance } from '@falang/workflow-integrations-common';
import { generateUuid } from '../generate-uuid.js';
import { getIntegrationInstances } from '../integration-instances.js';
import { getEnabledIntegrations } from '../disabled-vendors.js';
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
      'Read-only. Lists existing credential instances (id, vendor, name) — field values/secrets are never ' +
      'included, so an existing instance can be reused without ever seeing its credentials.',
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
    const instances = getIntegrationInstances(this.store.documents).map(({ id, name, vendor }) => ({
      id,
      name,
      vendor,
    }));
    return ok(JSON.stringify(instances));
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

    const instance: IIntegrationInstance = { fields, id: generateUuid(), name, vendor };
    this.store.saveIntegrationInstance(instance);
    return ok(JSON.stringify({ instanceId: instance.id }));
  }
}

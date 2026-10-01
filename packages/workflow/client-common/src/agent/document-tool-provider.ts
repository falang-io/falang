import type { ILlmToolCall, ILlmToolDefinition, TToolExecutionResult } from '@falang/agent';
import type { IAgentToolProvider } from '@falang/agent';
import { isValidFunctionName } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import type {
  IIntegrationInstance,
  IIntegrationStructType,
  ITriggerDescriptor,
  IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { TTriggerFunctionBodyData } from '@falang/workflow-dto';
import { getIntegrationInstances } from '../integration-instances.js';
import { getEnabledIntegrations } from '../disabled-vendors.js';
import { resolveTriggerCredentialId } from '../components/trigger-credential.js';
import { getVendorsInUse } from './integration-catalog.js';
import { type IProjectStructType, listTypes } from './list-types.js';
import type { WorkflowStore } from '../workflow-store.js';

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

/**
 * `credentialId` resolution for `create_trigger_document` — split out of the method itself to keep its
 * complexity down. `resolveTriggerCredentialId` also backs `NewTriggerModal`'s "skip the credential
 * picker" rule — see ADR 0037 (private) §4's implicit-target rule.
 */
const resolveCredentialIdForTool = (
  integration: IWorkflowIntegration,
  vendor: string,
  instances: readonly IIntegrationInstance[],
  requested: string | null,
): { credentialId: string } | { error: string } => {
  const implicitCredentialId = resolveTriggerCredentialId(integration, instances);
  if (!requested) {
    if (!implicitCredentialId) {
      return {
        error:
          'create_trigger_document: pass credentialId — instances for vendor ' +
          `"${vendor}": ${instances.length > 0 ? instances.map((item) => `${item.id} (${item.name})`).join(', ') : 'none'}`,
      };
    }
    return { credentialId: implicitCredentialId };
  }
  if (requested !== implicitCredentialId && !instances.some((item) => item.id === requested)) {
    return { error: `create_trigger_document: unknown credentialId "${requested}" for vendor "${vendor}"` };
  }
  return { credentialId: requested };
};

/** `trigger.contextFields` → `trigger-function-body.triggerConfig`, running each field's `validate` (if any). */
const buildTriggerConfigForTool = (
  trigger: ITriggerDescriptor,
  params: Record<string, unknown>,
): { config: Record<string, string> | null } | { error: string } => {
  if (!trigger.contextFields?.length) return { config: null };
  const contextFieldsInput = asRecord(params.contextFields);
  const config = Object.fromEntries(
    trigger.contextFields.map((field) => [
      field.name,
      typeof contextFieldsInput?.[field.name] === 'string' ? (contextFieldsInput[field.name] as string) : '',
    ]),
  );
  for (const field of trigger.contextFields) {
    if (!field.validate) continue;
    const error = field.validate(config[field.name] ?? '');
    if (error) return { error: `create_trigger_document: ${field.name}: ${error}` };
  }
  return { config };
};

/**
 * A real 2026-09-27 chat (a Telegram "guess the celebrity" bot) created an objects-structure document
 * named "GuessCelebrityStorage", evidently expecting a place to keep game state, then could not open it
 * (the agent was limited to function documents back then). Spell out up front that it only declares
 * types — see also `@falang/mcp-core`'s `NODE_KIND_NOTES` for the `objects-structure-*` node kinds.
 */
const OBJECTS_STRUCTURE_DESCRIPTION =
  "An 'objects-structure' document only DECLARES data types — TypeScript interfaces, one per " +
  '`objects-structure-thread` node, each property an `objects-structure-child` — used to type variables, ' +
  'parameters and properties (as `{ "type": "struct", "id": "<thread node id>" }`) so the editor can ' +
  'type-check and autocomplete them. It is NOT storage or a database: it holds no values and nothing can ' +
  'be saved into it at runtime (state lives in variables inside a function). Create one only when a ' +
  'function actually needs a structured type that no existing type (see list_types) covers, and name it ' +
  'after the domain it models (e.g. "GameTypes", "OrderModels"), never "…Storage"/"…Database". A new ' +
  'objects-structure document starts with placeholder interfaces (named like object1/object2, with ' +
  'placeholder properties): call get_tree on it, then turn them into the real interfaces with set_data/' +
  'insert_nodes, or delete the ones you do not need.';

const TOOLS: readonly ILlmToolDefinition[] = [
  {
    name: 'create_document',
    description:
      "Creates a new 'function' or 'objects-structure' document in this project and opens its tab. For a " +
      'trigger-bound function, use create_trigger_document instead. A function name must be an English, ' +
      'camelCase identifier (e.g. myFunctionName) — no spaces, punctuation, Cyrillic, or other non-Latin ' +
      `script — since it is compiled verbatim into the generated code as a real function name.\n\n${OBJECTS_STRUCTURE_DESCRIPTION}`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['function', 'objects-structure'] },
        folderId: { type: 'string' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'create_trigger_document',
    description:
      'Creates a new trigger-function document bound to a vendor trigger, and opens its tab. Call ' +
      "search_integrations first to find a valid vendor/triggerName (and read that trigger's notes), and " +
      'list_integration_instances for a valid credentialId. credentialId can be omitted for a vendor that ' +
      'needs no credentials at all (e.g. a schedule trigger) as long as the project has no existing ' +
      'instance of it — it is then filled in automatically; otherwise it is required. The name must be an ' +
      'English, camelCase identifier (e.g. myFunctionName) — no spaces, punctuation, Cyrillic, or other ' +
      'non-Latin script — since it is compiled verbatim into the generated code as a real function name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        vendor: { type: 'string' },
        triggerName: { type: 'string' },
        credentialId: { type: 'string' },
        contextFields: {
          type: 'object',
          description: 'Extra trigger-specific fields the trigger declares, keyed by field name.',
        },
        folderId: { type: 'string' },
      },
      required: ['name', 'vendor', 'triggerName'],
    },
  },
  {
    name: 'list_types',
    description:
      'Read-only. Struct types (interfaces) usable as `{ "type": "struct", "id": … }` anywhere a node takes a ' +
      'type (create-var, function parameters, array element types, interface properties). Always lists the ' +
      "project's own interfaces from objects-structure documents in full (with the declaring `documentId`). " +
      "Vendor built-in types (e.g. Telegram's incoming message) are listed only for vendors the project has " +
      'an integration instance for: in full when a vendor has only a few (after keyword filtering), otherwise ' +
      'as `id`/`name` only — some vendors have hundreds, so pass `keywords` (matched against type id/name) to ' +
      'narrow them down, then `ids` to get the full definitions of exactly the types you need. With `ids`, ' +
      'returns exactly those types in full (any vendor), nothing else. A struct reference needs the `id`, ' +
      'never the name. Not for integration instance/credential ids, and not for what a vendor node returns — ' +
      "a node's inputs and result variable are described by its own dataSchema (get_node_kinds).",
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        ids: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];

/**
 * `IAgentToolProvider` for creating new documents (ADR 0034 §4) — `create_document` for the two
 * blank-default types, `create_trigger_document` as its own tool since a trigger-function's root
 * needs real trigger identity up front (see `trigger-function-document.ts`'s own comment), plus
 * `list_types` so it can reference struct types by id. The trigger catalog lives in
 * `IntegrationToolProvider`'s `search_integrations`. No `Scheme` is touched directly, so `AgentSession` gives these no focus/pause/undo-group
 * treatment — persistence is the same `WorkflowStore.createDocument`/`createTriggerFunctionDocument`
 * (and its `ProjectSync`-backed autosave) the human "+" flow already uses.
 */
export class DocumentToolProvider implements IAgentToolProvider {
  readonly tools = TOOLS;

  private readonly store: WorkflowStore;

  constructor(store: WorkflowStore) {
    this.store = store;
  }

  execute(call: ILlmToolCall): TToolExecutionResult {
    switch (call.name) {
      case 'create_document': {
        return this.createDocument(call.input);
      }
      case 'create_trigger_document': {
        return this.createTriggerDocument(call.input);
      }
      case 'list_types': {
        return ok(
          JSON.stringify(
            listTypes({
              input: call.input,
              integrations: getEnabledIntegrations(),
              projectTypes: this.projectTypes(),
              vendorsInUse: getVendorsInUse(getEnabledIntegrations(), getIntegrationInstances(this.store.documents)),
              instanceTypes: this.instanceTypes(),
            }),
          ),
        );
      }
      default: {
        return fail(`Unknown tool: ${call.name}`);
      }
    }
  }

  private createDocument(input: unknown): TToolExecutionResult {
    const params = asRecord(input);
    const name = params && typeof params.name === 'string' ? params.name : null;
    const type = params && typeof params.type === 'string' ? params.type : null;
    if (!name) return fail('create_document: name is required');
    if (type !== 'function' && type !== 'objects-structure') {
      return fail(`create_document: type must be 'function' or 'objects-structure', got ${JSON.stringify(type)}`);
    }
    if (type === 'function' && !isValidFunctionName(name)) {
      return fail(
        `create_document: name "${name}" is invalid — a function name must be an English, camelCase ` +
          'identifier (e.g. myFunctionName), no spaces, punctuation, or non-Latin script',
      );
    }
    const folderId = params && typeof params.folderId === 'string' ? params.folderId : null;
    const documentId = this.store.createDocument(type, name, folderId);
    if (type === OBJECTS_STRUCTURE_NAME) {
      return ok(
        JSON.stringify({
          documentId,
          note:
            'Created with placeholder interfaces — call get_tree with this documentId, then rename/reshape ' +
            'or delete them. This document only declares types; it cannot store values.',
        }),
      );
    }
    return ok(JSON.stringify({ documentId }));
  }

  private createTriggerDocument(input: unknown): TToolExecutionResult {
    const params = asRecord(input);
    if (!params) return fail('create_trigger_document: invalid input');
    const name = typeof params.name === 'string' ? params.name : null;
    const vendor = typeof params.vendor === 'string' ? params.vendor : null;
    const triggerName = typeof params.triggerName === 'string' ? params.triggerName : null;
    if (!name || !vendor || !triggerName) {
      return fail('create_trigger_document: name, vendor and triggerName are required');
    }
    if (!isValidFunctionName(name)) {
      return fail(
        `create_trigger_document: name "${name}" is invalid — it must be an English, camelCase identifier ` +
          '(e.g. myFunctionName), no spaces, punctuation, or non-Latin script',
      );
    }

    const integration = getEnabledIntegrations().find((item) => item.vendor === vendor);
    if (!integration) return fail(`create_trigger_document: unknown vendor "${vendor}"`);
    const trigger = integration.triggers.find((item) => item.name === triggerName);
    if (!trigger) return fail(`create_trigger_document: unknown triggerName "${triggerName}" for vendor "${vendor}"`);

    const instances = getIntegrationInstances(this.store.documents).filter((item) => item.vendor === vendor);
    const requestedCredentialId = typeof params.credentialId === 'string' ? params.credentialId : null;
    const credentialResult = resolveCredentialIdForTool(integration, vendor, instances, requestedCredentialId);
    if ('error' in credentialResult) return fail(credentialResult.error);

    const configResult = buildTriggerConfigForTool(trigger, params);
    if ('error' in configResult) return fail(configResult.error);

    const bodyData: TTriggerFunctionBodyData = {
      vendor,
      triggerName,
      credentialId: credentialResult.credentialId,
      scopeVariableName: trigger.scopeVariableName,
      scopeType: trigger.scopeType,
      ...(configResult.config ? { triggerConfig: configResult.config } : {}),
    };
    const folderId = typeof params.folderId === 'string' ? params.folderId : null;
    const documentId = this.store.createTriggerFunctionDocument(name, bodyData, folderId);
    return ok(JSON.stringify({ documentId }));
  }

  /** The project's own interfaces, from the live registry (fed from every loaded objects-structure
   *  document and every edit — see `WorkflowStore.registerProjectStructTypes`/`schemeOnChanged`), keyed back
   *  to the declaring document through its root node id (the registry's `parentId`). */
  private projectTypes(): IProjectStructType[] {
    const documentIdByRootId = new Map(
      this.store.documents
        .filter((doc) => doc.type === OBJECTS_STRUCTURE_NAME && doc.data)
        .map((doc) => [doc.data?.id, doc.id]),
    );
    return [...this.store.typesRegistry.types.values()].flatMap((item) => {
      const documentId = documentIdByRootId.get(item.parentId);
      return documentId ? [{ documentId, id: item.id, name: item.name, properties: item.properties }] : [];
    });
  }

  /** Per-instance vendor-derived struct types (ADR 0039 (private) §5) for `list_types`' `instanceTypes`
   *  bucket — reads `store.vendorData.byInstance` directly, unlike `projectTypes` above. */
  private instanceTypes(): IIntegrationStructType[] {
    return getIntegrationInstances(this.store.documents).flatMap((instance) => {
      const integration = getEnabledIntegrations().find((item) => item.vendor === instance.vendor);
      if (!integration?.instanceTypes) return [];
      const vendorData = this.store.vendorData.byInstance.get(instance.id) ?? {};
      return integration.instanceTypes(instance, vendorData);
    });
  }
}

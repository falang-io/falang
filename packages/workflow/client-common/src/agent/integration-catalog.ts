import type { IAgentNodeKindFilter } from '@falang/agent';
import { ACTIVEPIECES_ACTION_NAME } from '@falang/workflow-dto';
import {
  describeTriggerForAgent,
  integrationNodeKindNames,
  searchIntegrationCatalog,
  type IIntegrationInstance,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';

/**
 * The agent-facing view of the vendor catalog (ADR 0034 (private)'s 2026-09-27 "token budget" note):
 * keyword search over vendors (`search_integrations`), the `get_node_kinds` listing filter, and which
 * vendors' struct types `list_types` exposes — all driven by the same rule, "a vendor is *in use* once
 * the project has an integration instance for it (or it needs no credentials at all)". Pure functions
 * over `IWorkflowIntegration[]`/`IIntegrationInstance[]` so they're testable without a `WorkflowStore`.
 */

/** Every ActivePieces piece's vendor id is `activepieces-<pieceName>` (`@falang/workflow-integrations-
 *  activepieces`'s `activepiecesVendorFor`) — the one generic `activepieces-action` node serves them all. */
const ACTIVEPIECES_VENDOR_PREFIX = 'activepieces-';

// The keyword ranking itself is shared with the workflow MCP server's `list_integrations`
// (`@falang/workflow-integrations-common`'s `search-integrations.ts`); re-exported under the names this
// module has always used.
export { normalizeKeywords, SEARCH_INTEGRATIONS_LIMIT } from '@falang/workflow-integrations-common';

const describeVendor = (integration: IWorkflowIntegration) => ({
  credentialFields: integration.credentialFields
    .filter((field) => !field.hidden)
    .map((field) => ({ kind: field.kind, name: field.name })),
  nodeKinds: integrationNodeKindNames(integration),
  notes: integration.notes,
  triggers: integration.triggers.map(describeTriggerForAgent),
  vendor: integration.vendor,
});

/** `search_integrations` — see `searchIntegrationCatalog`; a matched vendor is described by its notes,
 *  credential fields, triggers and node kind names (the kinds' schemas come from `get_node_kinds`). */
export const searchIntegrations = (integrations: readonly IWorkflowIntegration[], keywordsInput: unknown) =>
  searchIntegrationCatalog(integrations, keywordsInput, describeVendor);

/**
 * Vendors whose node kinds/types the agent should see: every vendor the project has an integration
 * instance for, plus every vendor that needs no credentials at all (e.g. `http-request`), which has no
 * instance to create in the first place.
 */
export const getVendorsInUse = (
  integrations: readonly IWorkflowIntegration[],
  instances: readonly IIntegrationInstance[],
): Set<string> => {
  const vendors = new Set(instances.map((instance) => instance.vendor));
  for (const integration of integrations) {
    if (integration.credentialFields.length === 0) vendors.add(integration.vendor);
  }
  return vendors;
};

export const NODE_KINDS_HIDDEN_NOTE =
  'Node kinds of integration vendors this project has no integration instance for are not listed. To use ' +
  'one, find it with search_integrations, create an instance with create_integration_instance, then call ' +
  'get_node_kinds again.';

/**
 * The workflow product's `IAgentNodeKindFilter`: a vendor's action/question/choice node kinds are listed
 * only while that vendor is in use (`getVendorsInUse`, re-read on every call so an instance created
 * mid-run unlocks them immediately); `activepieces-action` only once some ActivePieces piece is; a
 * vendor's *trigger* node kinds never (they sit in the shared stack but a trigger is bound through
 * `create_trigger_document`, not inserted as a statement). Every non-vendor kind is always listed.
 */
export const createWorkflowNodeKindFilter = (
  integrations: readonly IWorkflowIntegration[],
  getInstances: () => readonly IIntegrationInstance[],
): IAgentNodeKindFilter => {
  const ownerByNodeKind = new Map<string, string>();
  const triggerNodeKinds = new Set<string>();
  for (const integration of integrations) {
    for (const name of integrationNodeKindNames(integration)) ownerByNodeKind.set(name, integration.vendor);
    for (const trigger of integration.triggers) triggerNodeKinds.add(trigger.name);
  }
  return {
    hiddenNote: NODE_KINDS_HIDDEN_NOTE,
    isListed: (name) => {
      if (triggerNodeKinds.has(name)) return false;
      if (name === ACTIVEPIECES_ACTION_NAME) {
        return getInstances().some((instance) => instance.vendor.startsWith(ACTIVEPIECES_VENDOR_PREFIX));
      }
      const owner = ownerByNodeKind.get(name);
      return !owner || getVendorsInUse(integrations, getInstances()).has(owner);
    },
  };
};

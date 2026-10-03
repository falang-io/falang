import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';

/**
 * The `credentialId` to bind a new trigger-function to for a vendor with no credential fields at all
 * (`credentialFields.length === 0`) when the project has no *explicit* instance of that vendor yet —
 * the additive implicit-target rule from ADR 0037 (private) §4:
 * `IntegrationsRuntimeService` synthesizes one implicit target per (project, env) keyed by the vendor id
 * itself in that case, so `trigger-function-body.credentialId` can just be the vendor id and the
 * credential-picker step can be skipped entirely — used by both `NewTriggerModal` (skip the Select) and
 * `DocumentToolProvider.create_trigger_document` (fill in `credentialId` when the agent omits it).
 *
 * Returns `null` whenever a real credential instance still has to be picked explicitly: the vendor
 * needs real credentials (`credentialFields.length > 0`), or — the one existing vendor this also
 * covers — `webhook`'s project already has an explicit instance of it (its id is already baked into a
 * public URL handed to third parties, so it must keep being picked explicitly rather than silently
 * rebound to an implicit target with a different id).
 */
export const resolveTriggerCredentialId = (
  integration: Pick<IWorkflowIntegration, 'vendor' | 'credentialFields'> | undefined,
  instances: readonly Pick<IIntegrationInstance, 'id' | 'vendor'>[],
): string | null => {
  if (!integration || integration.credentialFields.length > 0) return null;
  const hasExplicitInstance = instances.some((instance) => instance.vendor === integration.vendor);
  return hasExplicitInstance ? null : integration.vendor;
};

/** One entry of the "New trigger" credential picker: what it binds the new trigger to. */
export interface ITriggerCredentialOption {
  /** Stable select value: `instance:<id>` or `vendor:<vendor>`. */
  key: string;
  vendor: string;
  /** The `trigger-function-body.credentialId` to store: an instance id, or the vendor id for an implicit target. */
  credentialId: string;
  /** The instance's own name; `null` for a credential-less vendor entry. */
  instanceName: string | null;
}

export interface ITriggerCredentialOptions {
  /** Configured instances of vendors that have triggers. */
  instances: ITriggerCredentialOption[];
  /** Credential-less vendors with triggers and no explicit instance yet (e.g. schedule): implicit targets. */
  withoutCredentials: ITriggerCredentialOption[];
}

/**
 * What the "New trigger" form's "Credentials" list offers (ADR 0042 Stage 0 UX): every project instance
 * whose vendor has at least one trigger, plus — as a separate group — each credential-less vendor with
 * triggers that has no explicit instance (`resolveTriggerCredentialId`). The vendor is then derived from
 * the selection instead of being picked first.
 */
export const buildTriggerCredentialOptions = (
  integrations: readonly Pick<IWorkflowIntegration, 'vendor' | 'credentialFields' | 'triggers'>[],
  instances: readonly Pick<IIntegrationInstance, 'id' | 'vendor' | 'name'>[],
): ITriggerCredentialOptions => {
  const withTriggers = integrations.filter((integration) => integration.triggers.length > 0);
  const vendors = new Set(withTriggers.map((integration) => integration.vendor));
  return {
    instances: instances
      .filter((instance) => vendors.has(instance.vendor))
      .map((instance) => ({
        key: `instance:${instance.id}`,
        vendor: instance.vendor,
        credentialId: instance.id,
        instanceName: instance.name,
      })),
    withoutCredentials: withTriggers.flatMap((integration) => {
      const credentialId = resolveTriggerCredentialId(integration, instances);
      return credentialId !== null && integration.credentialFields.length === 0
        ? [{ key: `vendor:${integration.vendor}`, vendor: integration.vendor, credentialId, instanceName: null }]
        : [];
    }),
  };
};

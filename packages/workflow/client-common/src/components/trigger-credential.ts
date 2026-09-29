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

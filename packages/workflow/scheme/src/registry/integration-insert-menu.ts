import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';

export interface IIntegrationMenuVendor {
  readonly vendor: string;
  /** The vendor's `label` — an i18n key or literal text, translated when the menu is shown. */
  readonly label: string;
  /** Node kinds insertable from the menu: the vendor's actions, questions and choices (never triggers). */
  readonly nodeNames: readonly string[];
}

/**
 * Vendors whose actions/questions/choices the insert menu offers: those with at least one configured
 * instance in the project's `Integrations` document, plus credential-less vendors (`credentialFields`
 * empty — `http-request`, `files`, `human-task`, `media`, …), which have nothing to configure and are
 * always available. Vendors left with no insertable node kind are omitted.
 */
export const getIntegrationMenuVendors = (
  integrations: readonly IWorkflowIntegration[],
  instances: readonly IIntegrationInstance[],
): IIntegrationMenuVendor[] => {
  const configured = new Set(instances.map((instance) => instance.vendor));
  return integrations
    .filter((integration) => integration.credentialFields.length === 0 || configured.has(integration.vendor))
    .map((integration) => ({
      vendor: integration.vendor,
      label: integration.label,
      nodeNames: [
        ...integration.actions.map((action) => action.name),
        ...(integration.questions ?? []).map((question) => question.name),
        ...(integration.choices ?? []).map((choice) => choice.name),
      ],
    }))
    .filter((entry) => entry.nodeNames.length > 0);
};

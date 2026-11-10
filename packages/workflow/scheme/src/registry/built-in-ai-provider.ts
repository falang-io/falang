import { createSchemeToken } from '@falang/di';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';

/**
 * Action node kinds the built-in AI provider does not serve yet (ADR 0081 (private) decision 7: v1 relays chat
 * completions only — `call-ai-text`/`call-ai-choice`). Kept here, keyed by node name, rather than as a vendor descriptor
 * flag: the list is a property of the relay's current coverage, not of the vendor, and shrinks to nothing once image
 * generation and transcription are relayed too.
 */
export const BUILT_IN_AI_PROVIDER_UNSUPPORTED_ACTIONS: ReadonlySet<string> = new Set([
  'call-ai-image',
  'call-ai-transcribe',
]);

/** The display name of the built-in AI provider, for editor hints (host-supplied: it depends on the brand and language). */
export interface IAiProviderNameProvider {
  getName(): string;
}

/**
 * Optional; registered by the host on the project container (the workflow client's `WorkflowStore`). Without it the
 * editor falls back to its own "Built-in provider" string.
 */
export const TOKEN_AI_PROVIDER_NAME = createSchemeToken<IAiProviderNameProvider>('AI_PROVIDER_NAME');

/**
 * Whether an action editor should warn that its selected integration runs on the built-in AI provider, which does not
 * support this action (`BUILT_IN_AI_PROVIDER_UNSUPPORTED_ACTIONS`).
 */
export const isUnsupportedOnBuiltInAiProvider = (
  actionName: string,
  credentialId: string,
  instances: readonly Pick<IIntegrationInstance, 'id' | 'platformProvider'>[],
): boolean => {
  if (!BUILT_IN_AI_PROVIDER_UNSUPPORTED_ACTIONS.has(actionName) || !credentialId) return false;
  return instances.some((instance) => instance.id === credentialId && instance.platformProvider === true);
};

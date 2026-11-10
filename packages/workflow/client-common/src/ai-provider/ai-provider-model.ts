import { supportsBuiltInProvider, type IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { IApiAiProviderModel } from '../api-types.js';

type TBuiltInCapable = Partial<Pick<IWorkflowIntegration, 'builtInProvider'>>;

/**
 * Whether the instance editor offers the "built-in provider" switch (ADR 0081 (private)): only for a vendor that
 * declares `builtInProvider`, and only when the deployment has the provider configured — or when the instance already
 * carries the flag (then it is shown with a "not available here" warning, so the user can turn it off).
 */
export const shouldShowAiProviderSwitch = (
  integration: TBuiltInCapable | null | undefined,
  configured: boolean,
  instanceHasFlag: boolean,
): boolean => Boolean(integration && supportsBuiltInProvider(integration)) && (configured || instanceHasFlag);

/** Whether `platformProvider: true` is persisted: only for a capable vendor with the switch on. */
export const resolvePlatformProvider = (integration: TBuiltInCapable | null | undefined, enabled: boolean): boolean =>
  Boolean(integration && supportsBuiltInProvider(integration)) && enabled;

/**
 * With the built-in provider on, the instance's own credential fields (OpenAI: `baseUrl`, `apiKey` dev/prod) are not
 * used: the editor hides them (keeping their values, so switching back restores the user's own key).
 */
export const isHiddenByAiProvider = (integration: TBuiltInCapable | null | undefined, enabled: boolean): boolean =>
  resolvePlatformProvider(integration, enabled);

/** The provider's chat models (the ones `call-ai-text`/`call-ai-choice` can use). */
export const chatModelsOf = (models: readonly IApiAiProviderModel[]): readonly IApiAiProviderModel[] =>
  models.filter((model) => model.kind === 'chat');

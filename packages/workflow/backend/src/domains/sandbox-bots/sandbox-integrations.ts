// oxlint-disable no-undefined -- an absent adapter is a real value.
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { REGISTERED_INTEGRATIONS } from '../integrations/registered-integrations.js';

/** DI token: the integrations that have a `sandbox` adapter (ADR 0073 (private)). Tests override it with a fake messenger. */
export const SANDBOX_INTEGRATIONS = Symbol('SANDBOX_INTEGRATIONS');

export const defaultSandboxIntegrations = (): readonly IWorkflowIntegration[] =>
  REGISTERED_INTEGRATIONS.filter((integration) => integration.sandbox !== undefined);

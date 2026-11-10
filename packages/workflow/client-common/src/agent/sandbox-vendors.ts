import type { IBuiltInAiProviderInfo } from '../ai-provider/ai-provider-store.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

/** Vendors with a platform test bot on this deployment; tolerant of hosts/tests whose store predates the method. */
export const sandboxVendorsOf = (store: Pick<Partial<IWorkflowAgentStore>, 'getSandboxVendors'>): readonly string[] =>
  typeof store.getSandboxVendors === 'function' ? store.getSandboxVendors() : [];

/** The built-in AI provider (ADR 0081 (private)), `null` when not configured or the store has no such method. */
export const builtInAiProviderOf = (
  store: Pick<Partial<IWorkflowAgentStore>, 'getBuiltInAiProvider'>,
): IBuiltInAiProviderInfo | null =>
  typeof store.getBuiltInAiProvider === 'function' ? store.getBuiltInAiProvider() : null;

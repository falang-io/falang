import type { IWorkflowAgentStore } from './workflow-agent-store.js';

/** Vendors with a platform test bot on this deployment; tolerant of hosts/tests whose store predates the method. */
export const sandboxVendorsOf = (store: Pick<Partial<IWorkflowAgentStore>, 'getSandboxVendors'>): readonly string[] =>
  typeof store.getSandboxVendors === 'function' ? store.getSandboxVendors() : [];

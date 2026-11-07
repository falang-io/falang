import { describe } from 'vitest';

/**
 * What the stack under test provides beyond the product itself. The kind stack (`docker-compose.workflow-e2e.yml`)
 * has everything; the fast local-mode run (`npm run test-e2e:fast`, ADR 0072 (private)) lists what it lacks in
 * `FALANG_E2E_MISSING` (comma-separated), and specs that need one of those are skipped there instead of failing.
 * Keep in sync with `@falang/workflow-e2e-tests`' `tests/e2e-capabilities.ts`.
 */
export type TWorkflowE2eCapability =
  | 'activepieces'
  | 'media'
  | 'mail'
  | 'user-databases'
  | 'egress-proxy'
  | 'temporal-isolation';

const missing = new Set(
  (process.env.FALANG_E2E_MISSING ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const workflowE2eHas = (capability: TWorkflowE2eCapability): boolean => !missing.has(capability);

/** `describe` when the stack has `capability`, `describe.skip` otherwise. */
export const describeIfStackHas = (capability: TWorkflowE2eCapability): typeof describe =>
  (workflowE2eHas(capability) ? describe : describe.skip) as typeof describe;

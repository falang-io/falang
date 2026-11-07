/**
 * What the stack under test provides beyond the product itself — the browser-tier copy of
 * `@falang/workflow-backend`'s `test-utils/workflow-e2e-capabilities.ts` (keep the two in sync). The kind stack has
 * everything; `npm run test-e2e:fast` (local mode) lists what it lacks in `FALANG_E2E_MISSING`.
 */
export type TE2eCapability =
  | 'activepieces'
  | 'media'
  | 'mail'
  | 'user-databases'
  | 'postgres-user-db'
  | 'mysql-user-db'
  | 'egress-proxy'
  | 'temporal-isolation';

const missing = new Set(
  (process.env.FALANG_E2E_MISSING ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const e2eHas = (capability: TE2eCapability): boolean => !missing.has(capability);

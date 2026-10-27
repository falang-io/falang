import type { V1Toleration } from '@kubernetes/client-node';

/** Defaults for a runner pod's local-storage bounds (security audit P1-3). */
export const DEFAULT_RUNNER_EPHEMERAL_STORAGE_LIMIT = '1Gi';
export const DEFAULT_RUNNER_EPHEMERAL_STORAGE_REQUEST = '256Mi';
export const DEFAULT_RUNNER_TMP_SIZE_LIMIT = '512Mi';

/**
 * `RUNNER_NODE_SELECTOR`: `key=value,key2=value2` → `nodeSelector`. Empty/unset → `undefined`. A malformed pair
 * (no `=` or an empty key) throws, so a typo in the deploy config fails loudly at boot rather than scheduling runners
 * next to the control plane.
 */
export const parseNodeSelector = (raw: string | undefined): Record<string, string> | undefined => {
  const text = raw?.trim();
  if (!text) return;
  const selector: Record<string, string> = {};
  for (const part of text.split(',')) {
    const pair = part.trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? '' : pair.slice(0, eq).trim();
    if (!key) throw new Error(`Invalid RUNNER_NODE_SELECTOR entry "${pair}" (expected key=value)`);
    selector[key] = pair.slice(eq + 1).trim();
  }
  if (Object.keys(selector).length > 0) return selector;
};

const EFFECTS = new Set(['NoSchedule', 'PreferNoSchedule', 'NoExecute']);

/**
 * `RUNNER_TOLERATIONS`: `key=value:NoSchedule,key2:NoExecute` → `tolerations` (`Equal` with a value, `Exists` without).
 * Empty/unset → `undefined`; a malformed entry throws.
 */
export const parseTolerations = (raw: string | undefined): V1Toleration[] | undefined => {
  const text = raw?.trim();
  if (!text) return;
  const tolerations: V1Toleration[] = [];
  for (const part of text.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.lastIndexOf(':');
    const hasEffect = colon !== -1;
    const effect = hasEffect ? entry.slice(colon + 1).trim() : '';
    const head = hasEffect ? entry.slice(0, colon).trim() : entry;
    if (hasEffect && !EFFECTS.has(effect)) {
      throw new Error(`Invalid RUNNER_TOLERATIONS effect "${effect}" in "${entry}"`);
    }
    const eq = head.indexOf('=');
    const key = (eq === -1 ? head : head.slice(0, eq)).trim();
    if (!key) throw new Error(`Invalid RUNNER_TOLERATIONS entry "${entry}" (expected key[=value][:Effect])`);
    tolerations.push({
      key,
      ...(eq === -1 ? { operator: 'Exists' } : { operator: 'Equal', value: head.slice(eq + 1).trim() }),
      ...(effect ? { effect } : {}),
    });
  }
  if (tolerations.length > 0) return tolerations;
};

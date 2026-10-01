import { TEMPORAL_NAMESPACE_PREFIX } from './temporal-config.js';

/** `falang-<projectId>` — a project's own Temporal namespace in `per-project` mode (ADR 0050 (private)). A UUID plus the prefix is 43 characters, far under `limit.maxIDLength`. */
export const temporalNamespaceFor = (projectId: string): string => `${TEMPORAL_NAMESPACE_PREFIX}${projectId}`;

/** Inverse of `temporalNamespaceFor`; `null` for any namespace that isn't one of ours (`default`, `temporal-system`, …). */
export const projectIdFromNamespace = (namespace: string): string | null =>
  namespace.startsWith(TEMPORAL_NAMESPACE_PREFIX) && namespace.length > TEMPORAL_NAMESPACE_PREFIX.length
    ? namespace.slice(TEMPORAL_NAMESPACE_PREFIX.length)
    : null;

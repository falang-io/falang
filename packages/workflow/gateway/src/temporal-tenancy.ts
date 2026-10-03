import { NamespaceNotFoundError, type Client } from '@temporalio/client';

/**
 * DI token for `ITemporalTenancy` — see ADR 0057 (private). A plain `Symbol`, same convention as
 * `SCHEDULE_CLIENT_PORT`; `@falang/workflow-backend`'s `TemporalModule` (global) provides the real one.
 */
export const TEMPORAL_TENANCY = Symbol('TEMPORAL_TENANCY');

/**
 * The one place that decides which Temporal namespace a project lives in and hands out a (pooled,
 * authenticated) client for it — an interface here so `@falang/workflow-gateway` never depends on
 * `@falang/workflow-backend`. `mode: 'shared'` is the pre-ADR-0057 behaviour (one namespace from
 * `TEMPORAL_NAMESPACE`, no tokens); `'per-project'` gives every project its own `falang-<projectId>`
 * namespace and signs short-lived JWTs for it (the backend's own client carries an admin token).
 */
export interface ITemporalTenancy {
  readonly mode: 'shared' | 'per-project';
  /** Namespace `projectId`'s workflows, schedules and task queues live in. Pure — never touches Temporal. */
  namespaceFor(projectId: string): string;
  /** Registers `projectId`'s namespace if it doesn't exist yet. Idempotent and cached — a no-op in `'shared'` mode. */
  ensureNamespace(projectId: string): Promise<void>;
  /** A client bound to `projectId`'s namespace over the shared backend connection; ensures the namespace exists first. Callers must never close its connection. */
  getClient(projectId: string): Promise<Client>;
  /** Like `getClient`, but for an already-known namespace and without registering it — for read-only sweeps (a missing namespace surfaces as `NamespaceNotFoundError`). */
  getClientForNamespace(namespace: string): Promise<Client>;
  /** Every namespace a cross-project sweep (e.g. schedule `listAll`) has to visit: the one shared namespace, or every existing `falang-*` one. */
  listTenantNamespaces(): Promise<readonly string[]>;
}

/**
 * Whether `error` means "this namespace doesn't exist (any more)": the SDK's own `NamespaceNotFoundError`, or a
 * raw gRPC `NOT_FOUND` whose message names a namespace (not every client call maps the server's error details
 * into the typed error — visibility/schedule listing, for one, can surface the plain status).
 */
export const isNamespaceNotFoundError = (error: unknown): boolean => {
  if (error instanceof NamespaceNotFoundError) return true;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const { code, message } = current as { code?: unknown; message?: unknown };
    if (code === 5 && typeof message === 'string' && /namespace/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

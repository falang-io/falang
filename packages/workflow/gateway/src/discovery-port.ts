import type { IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';

export interface IIntegrationCredentialInstance {
  readonly instanceId: string;
  readonly vendor: string;
  readonly projectId: string;
}

/**
 * The only thing `IntegrationsRuntimeService` needs from the host app to drive every vendor's
 * `registerBackend` — deliberately generic (no TypeORM/`Document` entity in sight), implemented by
 * `@falang/workflow-backend` and injected via `GatewayModule.forRootAsync`.
 */
export interface IIntegrationsDiscoveryPort {
  /** Every configured credential instance across every project — re-queried once per discovery tick to pick up newly added/removed credentials. */
  findCredentialInstances(): Promise<readonly IIntegrationCredentialInstance[]>;
  /**
   * Resolves `instanceId`'s `credentialFields` for `env`, decrypted. Returns `undefined` when nothing
   * is meaningfully configured for this env yet (e.g. every secret field is empty for it) — the
   * runtime retries such an instance/env on every later discovery tick instead of giving up on it.
   */
  resolveCredentialFields(
    vendor: string,
    instanceId: string,
    env: 'dev' | 'prod',
    /** The instance's own project — credential ids are client-chosen, so the id alone never identifies one instance. */
    projectId: string,
  ): Promise<Readonly<Record<string, string>> | undefined>;
  /** Documents of `type`, scoped to `projectId` — backs `IIntegrationBackendContext.getDocumentsByType`. */
  getDocumentsByType(projectId: string, type: string): Promise<readonly IIntegrationDocumentRecord[]>;
  /** This project/env's Temporal task queue — must match `@falang/workflow-backend`'s `BuildService` naming. */
  taskQueueFor(projectId: string, env: 'dev' | 'prod'): string;
  /**
   * Every project's id — backs `IntegrationsRuntimeService`'s implicit-target synthesis (see
   * ADR 0037 (private) §4): a vendor with `credentialFields: []` and a
   * `registerBackend` gets one implicit target per (project, env) even when the project has no explicit
   * credential instance of it, so `findCredentialInstances()` alone (which only reports *configured*
   * instances) isn't enough to know which projects exist at all.
   */
  listProjectIds(): Promise<readonly string[]>;
}

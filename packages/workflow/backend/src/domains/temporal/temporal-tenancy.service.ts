import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Client, Connection, type ConnectionOptions } from '@temporalio/client';
import { msNumberToTs } from '@temporalio/common/lib/time';
import type { ITemporalTenancy } from '@falang/workflow-gateway';
import { TEMPORAL_NAMESPACE_PREFIX, type ITemporalConfig } from './temporal-config.js';
import {
  GRPC_ALREADY_EXISTS,
  GRPC_NOT_FOUND,
  grpcCodeOf,
  isTransientStartupError,
  reportIfPermissionDenied,
} from './temporal-errors.js';
import { temporalNamespaceFor } from './temporal-namespace.js';
import type { TemporalTokenService } from './temporal-token.service.js';

const SECONDS_PER_DAY = 86_400;
/** Re-mint the backend's admin token once it has less than this left (its TTL is 5 minutes). */
const ADMIN_TOKEN_REFRESH_MARGIN_MS = 60_000;
const VISIBILITY_ATTEMPTS = 15;
const VISIBILITY_RETRY_DELAY_MS = 200;
const TRANSIENT_RETRY_DELAY_MS = 1000;
const LIST_NAMESPACES_PAGE_SIZE = 100;

export interface ITemporalTenancyDeps {
  /** `Connection.lazy` by default — overridable so unit tests need no server. */
  readonly createConnection?: (options: ConnectionOptions) => Connection;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Real `ITemporalTenancy` (ADR 0057 (private)). One shared, lazily-connected `Connection` for the whole
 * backend — in `per-project` mode its `apiKey` is a function returning a short-lived
 * `temporal-system:admin` JWT (`tls: false` unless `TEMPORAL_TLS=true`: the SDK turns TLS on whenever an
 * `apiKey` is present) — and one cached `Client` per namespace on top of it. Callers never close the
 * connection. `shared` mode keeps today's behaviour: one namespace, no token.
 */
@Injectable()
export class TemporalTenancyService implements ITemporalTenancy, OnModuleDestroy {
  private readonly logger = new Logger(TemporalTenancyService.name);
  private readonly config: ITemporalConfig;
  private readonly tokens: TemporalTokenService | null;
  private readonly createConnection: (options: ConnectionOptions) => Connection;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private connection: Connection | null = null;
  private readonly clients = new Map<string, Client>();
  private readonly knownNamespaces = new Set<string>();
  private readonly pendingEnsures = new Map<string, Promise<void>>();
  private adminToken: { readonly token: string; readonly expiresAtMs: number } | null = null;

  constructor(config: ITemporalConfig, tokens: TemporalTokenService | null = null, deps: ITemporalTenancyDeps = {}) {
    if (config.mode === 'per-project' && !tokens) {
      throw new Error('TemporalTenancyService in per-project mode needs a TemporalTokenService');
    }
    this.config = config;
    this.tokens = tokens;
    this.createConnection = deps.createConnection ?? ((options) => Connection.lazy(options));
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? Date.now;
  }

  get mode(): 'shared' | 'per-project' {
    return this.config.mode;
  }

  namespaceFor(projectId: string): string {
    return this.config.mode === 'shared' ? this.config.sharedNamespace : temporalNamespaceFor(projectId);
  }

  async ensureNamespace(projectId: string): Promise<void> {
    if (this.config.mode === 'shared') return;
    await this.ensureNamespaceByName(this.namespaceFor(projectId));
  }

  async getClient(projectId: string): Promise<Client> {
    await this.ensureNamespace(projectId);
    return this.getClientForNamespace(this.namespaceFor(projectId));
  }

  getClientForNamespace(namespace: string): Promise<Client> {
    let client = this.clients.get(namespace);
    if (!client) {
      client = new Client({ connection: this.getConnection(), namespace });
      this.clients.set(namespace, client);
    }
    return Promise.resolve(client);
  }

  async listTenantNamespaces(): Promise<readonly string[]> {
    if (this.config.mode === 'shared') return [this.config.sharedNamespace];
    const names: string[] = [];
    let page = await this.listNamespacesPage(null);
    for (;;) {
      for (const info of page.namespaces ?? []) {
        const name = info.namespaceInfo?.name;
        if (name?.startsWith(TEMPORAL_NAMESPACE_PREFIX)) names.push(name);
      }
      if (!page.nextPageToken || page.nextPageToken.length === 0) break;
      // oxlint-disable-next-line no-await-in-loop -- pages must be fetched sequentially (each token comes from the previous page).
      page = await this.listNamespacesPage(page.nextPageToken);
    }
    return names;
  }

  private listNamespacesPage(nextPageToken: Uint8Array | null) {
    return this.guard('listNamespaces', () =>
      this.getConnection().workflowService.listNamespaces({ pageSize: LIST_NAMESPACES_PAGE_SIZE, nextPageToken }),
    );
  }

  /** Registers `namespace` (idempotent) and waits until the frontend can see it. */
  ensureNamespaceByName(namespace: string): Promise<void> {
    if (this.knownNamespaces.has(namespace)) return Promise.resolve();
    const pending = this.pendingEnsures.get(namespace);
    if (pending) return pending;
    const promise = this.registerAndAwait(namespace)
      .then(() => {
        this.knownNamespaces.add(namespace);
      })
      .finally(() => {
        this.pendingEnsures.delete(namespace);
      });
    this.pendingEnsures.set(namespace, promise);
    return promise;
  }

  /** Operator `DeleteNamespace`; an already-missing namespace is fine. Takes its workflows, schedules and history with it. */
  async deleteNamespace(namespace: string): Promise<void> {
    if (this.config.mode === 'shared') throw new Error('Refusing to delete the shared namespace');
    if (!namespace.startsWith(TEMPORAL_NAMESPACE_PREFIX)) {
      throw new Error(
        `Refusing to delete namespace "${namespace}": not a ${TEMPORAL_NAMESPACE_PREFIX}* tenant namespace`,
      );
    }
    try {
      await this.guard('deleteNamespace', () => this.getConnection().operatorService.deleteNamespace({ namespace }));
    } catch (error) {
      if (grpcCodeOf(error) !== GRPC_NOT_FOUND) throw error;
    }
    this.knownNamespaces.delete(namespace);
    this.clients.delete(namespace);
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
    this.connection = null;
  }

  private async registerAndAwait(namespace: string): Promise<void> {
    const connection = this.getConnection();
    try {
      await this.retryWhileStarting('registerNamespace', () =>
        connection.workflowService.registerNamespace({
          namespace,
          workflowExecutionRetentionPeriod: msNumberToTs(this.config.retentionDays * SECONDS_PER_DAY * 1000),
        }),
      );
      this.logger.log(`Registered Temporal namespace ${namespace}`);
    } catch (error) {
      if (grpcCodeOf(error) !== GRPC_ALREADY_EXISTS) throw error;
    }
    // The frontend's namespace cache refreshes a moment after registration (and on every replica separately).
    for (let attempt = 1; attempt <= VISIBILITY_ATTEMPTS; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential polling by design.
        await this.retryWhileStarting('describeNamespace', () =>
          connection.workflowService.describeNamespace({ namespace }),
        );
        return;
      } catch (error) {
        if (grpcCodeOf(error) !== GRPC_NOT_FOUND || attempt === VISIBILITY_ATTEMPTS) throw error;
        // oxlint-disable-next-line no-await-in-loop -- sequential polling by design.
        await this.sleep(VISIBILITY_RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Retries `call` while Temporal is merely not ready — unreachable, or refusing our valid token because
   * it hasn't loaded the JWKS yet (it polls this backend for it) — for up to `ensureTimeoutMs`; any other
   * answer (including `AlreadyExists`) is returned/thrown at once. A refusal that outlasts the timeout is
   * logged as a security-relevant denial and rethrown.
   */
  private async retryWhileStarting<T>(context: string, call: () => Promise<T>): Promise<T> {
    const deadline = this.now() + this.config.ensureTimeoutMs;
    for (;;) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
        return await call();
      } catch (error) {
        if (!isTransientStartupError(error) || this.now() + TRANSIENT_RETRY_DELAY_MS > deadline) {
          reportIfPermissionDenied(this.logger, context, error);
          throw error;
        }
        this.logger.warn(
          `Temporal not ready for ${context} (${error instanceof Error ? error.message : String(error)}); retrying`,
        );
        // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
        await this.sleep(TRANSIENT_RETRY_DELAY_MS);
      }
    }
  }

  private async guard<T>(context: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      reportIfPermissionDenied(this.logger, context, error);
      throw error;
    }
  }

  private getConnection(): Connection {
    if (!this.connection) {
      const options: ConnectionOptions =
        this.config.mode === 'per-project'
          ? { address: this.config.address, apiKey: () => this.currentAdminToken(), tls: this.config.tls }
          : { address: this.config.address };
      this.connection = this.createConnection(options);
    }
    return this.connection;
  }

  private currentAdminToken(): string {
    const nowMs = this.now();
    if (!this.adminToken || this.adminToken.expiresAtMs - nowMs < ADMIN_TOKEN_REFRESH_MARGIN_MS) {
      const minted = (this.tokens as TemporalTokenService).mintAdminToken();
      this.adminToken = { token: minted.token, expiresAtMs: Date.parse(minted.expiresAt) };
    }
    return this.adminToken.token;
  }
}

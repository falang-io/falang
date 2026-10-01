import { generateKeyPairSync } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Connection, type ConnectionOptions } from '@temporalio/client';
import type { Repository } from 'typeorm';
import { AppSettingsService } from '../admin/app-settings/app-settings.service.js';
import { Project } from '../projects/projects/project.entity.js';
import { checkTemporalAuthorizationEnforced, type TAuthProbe } from './temporal-auth-self-check.js';
import { TEMPORAL_CONFIG, type ITemporalConfig } from './temporal-config.js';
import { isTransientStartupError, reportIfPermissionDenied } from './temporal-errors.js';
import { signJwt } from './temporal-jwt.js';
import { pauseLegacyNamespaceSchedules } from './temporal-legacy-sweep.js';
import { ORPHAN_NAMESPACE_GRACE_MS, sweepOrphanedNamespaces, type TOrphanMarks } from './temporal-orphan-sweep.js';
import { TemporalTenancyService } from './temporal-tenancy.service.js';
import { JWT_ISSUER } from './temporal-config.js';

const ORPHAN_MARKS_KEY = 'temporal.orphanedNamespaces';
const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 60_000;
const DEFAULT_SELF_CHECK_TIMEOUT_MS = 60_000;
const SELF_CHECK_RETRY_DELAY_MS = 2000;
const PROBE_DEADLINE_MS = 5000;
const LEGACY_SWEEP_ATTEMPTS = 12;
const LEGACY_SWEEP_RETRY_DELAY_MS = 10_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * `per-project` mode housekeeping (ADR 0050 (private)): the startup self-check that Temporal really
 * enforces authorization (the backend refuses to start otherwise), a one-off pause of schedules left in
 * the legacy shared namespace, and the periodic sweep of namespaces whose project was deleted (after a
 * 24 h grace). Does nothing in `shared` mode.
 */
@Injectable()
export class TemporalLifecycleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TemporalLifecycleService.name);
  private readonly temporalConfig: ITemporalConfig;
  private readonly tenancy: TemporalTenancyService;
  private readonly projects: Repository<Project>;
  private readonly appSettings: AppSettingsService;
  private readonly config: ConfigService;
  private timer: NodeJS.Timeout | undefined;
  private sweeping = false;

  constructor(
    @Inject(TEMPORAL_CONFIG) temporalConfig: ITemporalConfig,
    @Inject(TemporalTenancyService) tenancy: TemporalTenancyService,
    @InjectRepository(Project) projects: Repository<Project>,
    @Inject(AppSettingsService) appSettings: AppSettingsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.temporalConfig = temporalConfig;
    this.tenancy = tenancy;
    this.projects = projects;
    this.appSettings = appSettings;
    this.config = config;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.temporalConfig.mode !== 'per-project') return;

    if (this.config.get<string>('TEMPORAL_AUTH_SELF_CHECK') !== 'false') await this.runSelfCheck();

    if (this.config.get<string>('TEMPORAL_LEGACY_SWEEP') !== 'false') {
      this.pauseLegacySchedulesWithRetry().catch((error: unknown) => {
        reportIfPermissionDenied(this.logger, 'legacy schedule sweep', error);
        this.logger.error('Legacy schedule sweep failed', error instanceof Error ? error.stack : error);
      });
    }

    const intervalMs = Number(
      this.config.get<string>('TEMPORAL_NAMESPACE_SWEEP_INTERVAL_MS') ?? DEFAULT_SWEEP_INTERVAL_MS,
    );
    const tick = (): void => {
      this.sweepOrphans().catch((error: unknown) => {
        this.logger.error('Orphaned namespace sweep failed', error instanceof Error ? error.stack : error);
      });
    };
    setTimeout(tick, Math.min(FIRST_SWEEP_DELAY_MS, intervalMs)).unref();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Throws (aborting the boot) when Temporal answers a tokenless or wrongly-signed request instead of refusing it. */
  async runSelfCheck(): Promise<void> {
    const { address, tls } = this.temporalConfig;
    const foreignKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const foreignToken = signJwt({
      privateKey: foreignKey,
      kid: 'self-check-foreign-key',
      claims: {
        iss: JWT_ISSUER,
        aud: this.temporalConfig.jwt?.audience,
        sub: 'self-check',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        permissions: ['temporal-system:admin'],
      },
    });
    const probeWith =
      (options: ConnectionOptions): TAuthProbe =>
      async () => {
        const connection = Connection.lazy({ address, tls, ...options });
        try {
          await connection.withDeadline(Date.now() + PROBE_DEADLINE_MS, () =>
            connection.workflowService.listNamespaces({ pageSize: 1 }),
          );
        } finally {
          await connection.close();
        }
      };
    const outcome = await checkTemporalAuthorizationEnforced(
      { anonymous: probeWith({}), foreignToken: probeWith({ apiKey: foreignToken }) },
      {
        timeoutMs: Number(this.config.get<string>('TEMPORAL_SELF_CHECK_TIMEOUT_MS') ?? DEFAULT_SELF_CHECK_TIMEOUT_MS),
        retryDelayMs: SELF_CHECK_RETRY_DELAY_MS,
        sleep,
        now: Date.now,
        warn: (message) => this.logger.warn(message),
      },
    );
    if (outcome.status === 'not-enforced') {
      throw new Error(
        `Temporal authorization is NOT enforced (accepted: ${outcome.failed.join(', ')}). ` +
          'TEMPORAL_TENANT_ISOLATION=per-project needs the Temporal frontend configured with global.authorization ' +
          "(default authorizer + JWT key source pointing at this backend's /internal/temporal/jwks.json) — see the self-hosting docs. " +
          "Refusing to start: tenants would otherwise reach each other's namespaces.",
      );
    }
    if (outcome.status === 'unreachable') {
      this.logger.error(
        `Could not verify Temporal authorization at startup (Temporal unreachable: ${outcome.message}); continuing — namespace operations will fail until it is up`,
      );
      return;
    }
    this.logger.log('Temporal authorization is enforced (anonymous and foreign-token requests are refused)');
  }

  /**
   * Runs right after boot, before the HTTP listener is up — Temporal can't have fetched the JWKS from this
   * backend yet, so a refusal or an unreachable server is retried for a while before giving up.
   */
  private async pauseLegacySchedulesWithRetry(): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
        await this.pauseLegacySchedules();
        return;
      } catch (error) {
        if (!isTransientStartupError(error) || attempt >= LEGACY_SWEEP_ATTEMPTS) throw error;
        // oxlint-disable-next-line no-await-in-loop -- sequential retries by design.
        await sleep(LEGACY_SWEEP_RETRY_DELAY_MS);
      }
    }
  }

  async pauseLegacySchedules(): Promise<readonly string[]> {
    const legacyNamespace = this.config.get<string>('TEMPORAL_LEGACY_NAMESPACE') ?? this.temporalConfig.sharedNamespace;
    const client = await this.tenancy.getClientForNamespace(legacyNamespace);
    const paused = await pauseLegacyNamespaceSchedules(
      client,
      'Paused: project moved to its own Temporal namespace (ADR 0050)',
    );
    if (paused.length > 0) {
      this.logger.warn(
        `Paused ${paused.length} legacy schedule(s) in namespace "${legacyNamespace}": ${paused.join(', ')}`,
      );
    }
    return paused;
  }

  /** One orphan-namespace sweep — public for tests/ops; overlapping runs are skipped. */
  async sweepOrphans(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const result = await sweepOrphanedNamespaces({
        listNamespaces: () => this.tenancy.listTenantNamespaces(),
        listProjectIds: async () => {
          const rows = await this.projects.find({ select: { id: true } });
          return rows.map((project) => project.id);
        },
        deleteNamespace: (namespace) => this.tenancy.deleteNamespace(namespace),
        loadMarks: async () => {
          const raw = await this.appSettings.get(ORPHAN_MARKS_KEY);
          return raw ? (JSON.parse(raw) as TOrphanMarks) : {};
        },
        saveMarks: (marks) => this.appSettings.set(ORPHAN_MARKS_KEY, JSON.stringify(marks)),
        now: Date.now,
        graceMs: ORPHAN_NAMESPACE_GRACE_MS,
        onError: (namespace, error) => {
          reportIfPermissionDenied(this.logger, `delete ${namespace}`, error);
          this.logger.error(
            `Failed to delete orphaned namespace ${namespace}`,
            error instanceof Error ? error.stack : error,
          );
        },
      });
      if (result.deleted.length > 0)
        this.logger.log(`Deleted orphaned Temporal namespaces: ${result.deleted.join(', ')}`);
    } finally {
      this.sweeping = false;
    }
  }
}

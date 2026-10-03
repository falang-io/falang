import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createInternalOriginMatcher, installEgressRouting } from '@falang/workflow-egress';
import { ProxySettingsService } from '../admin/app-settings/proxy-settings.service.js';

const REFRESH_INTERVAL_MS = 15_000;

/** Env vars naming origins that must never go through the egress proxy (backend's own traffic to internal services). */
export const INTERNAL_ORIGIN_ENV_NAMES = [
  'ACTIVEPIECES_SERVICE_URL',
  'MEDIA_SERVICE_URL',
  'BACKEND_INTERNAL_URL',
  'BACKEND_PUBLIC_URL',
  'RUNNER_ACTIVEPIECES_SERVICE_URL',
  'RUNNER_MEDIA_SERVICE_URL',
] as const;

/**
 * Installs the process-global egress routing (ADR 0056 (private)): vendor code running inside
 * `runWithEgressVendor` is sent through the admin-configured proxy. Registered by `AppModule` only — the
 * in-memory test harness (`buildTestAppImports`) never installs a process-global dispatcher. `EGRESS_ROUTING=off`
 * disables it for any other host.
 */
@Injectable()
export class EgressRoutingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EgressRoutingService.name);
  private readonly proxySettings: ProxySettingsService;
  private readonly config: ConfigService;
  private timer: NodeJS.Timeout | null = null;
  private routing: { dispose(): void } | null = null;

  constructor(
    @Inject(ProxySettingsService) proxySettings: ProxySettingsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.proxySettings = proxySettings;
    this.config = config;
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('EGRESS_ROUTING') === 'off') return;
    await this.safeRefresh();
    this.timer = setInterval(() => {
      this.safeRefresh().catch(() => null);
    }, REFRESH_INTERVAL_MS);
    this.timer.unref();
    this.routing = installEgressRouting({
      getConfig: () => this.proxySettings.getCached(),
      isInternal: createInternalOriginMatcher(INTERNAL_ORIGIN_ENV_NAMES.map((name) => this.config.get<string>(name))),
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.routing?.dispose();
    this.routing = null;
  }

  private async safeRefresh(): Promise<void> {
    try {
      await this.proxySettings.refresh();
    } catch (error) {
      this.logger.warn(
        `Egress proxy settings refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

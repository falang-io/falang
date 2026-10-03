import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TEMPORAL_TENANCY } from '@falang/workflow-gateway';
import { AppSettingsModule } from '../admin/app-settings/app-settings.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Project } from '../projects/projects/project.entity.js';
import { JwksController } from './jwks.controller.js';
import { TEMPORAL_CONFIG, resolveTemporalConfig, type ITemporalConfig } from './temporal-config.js';
import { TemporalLifecycleService } from './temporal-lifecycle.service.js';
import { TemporalTenancyService } from './temporal-tenancy.service.js';
import { TemporalTokenController } from './temporal-token.controller.js';
import { TemporalTokenService } from './temporal-token.service.js';

const ENV_KEYS = [
  'TEMPORAL_TENANT_ISOLATION',
  'TEMPORAL_ADDRESS',
  'TEMPORAL_NAMESPACE',
  'TEMPORAL_TLS',
  'TEMPORAL_NAMESPACE_RETENTION_DAYS',
  'TEMPORAL_ENSURE_TIMEOUT_MS',
  'TEMPORAL_JWT_PRIVATE_KEY',
  'TEMPORAL_JWT_KEY_ID',
  'TEMPORAL_JWT_PREVIOUS_PUBLIC_KEY',
  'TEMPORAL_JWT_TTL_SECONDS',
  'TEMPORAL_JWT_AUDIENCE',
] as const;

/**
 * Temporal tenant isolation (ADR 0057 (private)): the resolved config, the RS256 token signer + JWKS
 * (only in `per-project` mode), the `ITemporalTenancy` every Temporal-touching domain resolves its
 * namespace and client through, and the namespace housekeeping. `@Global` so `BuildModule`, `RunsModule`,
 * `TasksModule` and `@falang/workflow-gateway`'s `GatewayModule` can inject `TEMPORAL_TENANCY` without an
 * explicit import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Project]), AppSettingsModule, ProjectTokenModule],
  controllers: [JwksController, TemporalTokenController],
  providers: [
    {
      provide: TEMPORAL_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ITemporalConfig =>
        resolveTemporalConfig(Object.fromEntries(ENV_KEYS.map((key) => [key, config.get<string>(key)]))),
    },
    {
      // `null` in `shared` mode: nothing to sign, and `JwksController`/`TemporalTokenController` answer 404.
      provide: TemporalTokenService,
      inject: [TEMPORAL_CONFIG],
      useFactory: (config: ITemporalConfig) => (config.jwt ? new TemporalTokenService(config.jwt) : null),
    },
    {
      provide: TemporalTenancyService,
      inject: [TEMPORAL_CONFIG, TemporalTokenService],
      useFactory: (config: ITemporalConfig, tokens: TemporalTokenService | null) =>
        new TemporalTenancyService(config, tokens),
    },
    { provide: TEMPORAL_TENANCY, useExisting: TemporalTenancyService },
    TemporalLifecycleService,
  ],
  exports: [TEMPORAL_TENANCY, TemporalTenancyService, TEMPORAL_CONFIG],
})
export class TemporalModule {}

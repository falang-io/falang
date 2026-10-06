// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import * as path from 'node:path';
import { Module, type DynamicModule, type ModuleMetadata } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import {
  FILE_UPLOAD_PORT,
  GatewayModule,
  type IFileUploadPort,
  type IIntegrationsDiscoveryPort,
} from '@falang/workflow-gateway';
import type { MigrationInterface, Repository } from 'typeorm';
import { AdminModule } from './domains/admin/admin.module.js';
import { AgentChatModule } from './domains/agent-chat/agent-chat.module.js';
import { AuthModule } from './domains/auth/auth/auth.module.js';
import { JwtAuthGuard } from './domains/auth/auth/jwt-auth.guard.js';
import { PersonalAccessTokensModule } from './domains/auth/personal-access-tokens/personal-access-tokens.module.js';
import { BuildModule } from './domains/build/build/build.module.js';
import { EgressRoutingModule } from './domains/egress-proxy/egress-routing.module.js';
import { EgressProxyModule } from './domains/egress-proxy/egress-proxy.module.js';
import { FilesModule } from './domains/files/files.module.js';
import { ActivepiecesCatalogService } from './domains/integrations/activepieces-catalog.service.js';
import { requireEncryptionKey } from './domains/integrations/credentials-crypto.js';
import { createIntegrationsDiscoveryPort } from './domains/integrations/integrations-discovery-port.js';
import { IntegrationsModule } from './domains/integrations/integrations.module.js';
import { REGISTERED_INTEGRATIONS } from './domains/integrations/registered-integrations.js';
import { ProjectTokenModule } from './domains/internal-auth/project-token.module.js';
import { ProjectTokenService } from './domains/internal-auth/project-token.service.js';
import { SupportModule } from './domains/support/support.module.js';
import { McpModule } from './domains/mcp/mcp.module.js';
import { Document } from './domains/projects/documents/document.entity.js';
import { DocumentsModule } from './domains/projects/documents/documents.module.js';
import { ProjectExportModule } from './domains/projects/export/project-export.module.js';
import { FoldersModule } from './domains/projects/folders/folders.module.js';
import { HealthModule } from './domains/health/health.module.js';
import { Project } from './domains/projects/projects/project.entity.js';
import { ProjectsModule } from './domains/projects/projects/projects.module.js';
import { ProjectTemplatesModule } from './domains/projects/templates/project-templates.module.js';
import { TreeModule } from './domains/projects/tree/tree.module.js';
import { VersioningModule } from './domains/projects/versioning/versioning.module.js';
import { RunsModule } from './domains/runs/runs.module.js';
import { TasksModule } from './domains/tasks/tasks.module.js';
import { TemporalModule } from './domains/temporal/temporal.module.js';
import { UsersModule } from './domains/users/users/users.module.js';

/** Anything Nest accepts in a module's `imports` (incl. async dynamic modules like `GatewayModule.forRootAsync`). */
export type TAppImport = NonNullable<ModuleMetadata['imports']>[number];

/** A TypeORM migration: a glob of `.ts` files (resolved like the built-in `migrations/*.ts`) or a migration class. */
export type TAppMigration = string | (new () => MigrationInterface);

export interface IAppModuleOptions {
  /** Additional Nest modules (e.g. a private "cloud" overlay) appended after every built-in domain module. */
  extraModules?: TAppImport[];
  /**
   * Migrations of those extra modules' own tables, run together with the built-in ones (TypeORM orders all of them by
   * the timestamp in the class name, so an overlay migration may rely on any built-in table older than itself).
   */
  extraMigrations?: TAppMigration[];
}

const buildBuiltInImports = (extraMigrations: readonly TAppMigration[] = []): TAppImport[] => [
  ConfigModule.forRoot({ isGlobal: true }),
  TypeOrmModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      type: 'postgres',
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      username: config.get<string>('DB_USER', 'falang'),
      password: config.get<string>('DB_PASSWORD', 'falang'),
      database: config.get<string>('DB_NAME', 'falang_workflow'),
      autoLoadEntities: true,
      // Real migrations (see ADR 0016 (private)'s Phase 0) —
      // `synchronize: true` risked silent data loss on a public deployment's schema drift.
      // `.ts` files directly: this repo has no build step and runs everything through `tsx`
      // (see `src/data-source.ts`, used by the `npm run migration:*` CLI scripts, which points
      // at the same glob so both pick up the same files).
      migrations: [path.join(__dirname, 'migrations', '*.ts'), ...extraMigrations],
      migrationsRun: true,
      synchronize: false,
    }),
  }),
  UsersModule,
  AuthModule,
  PersonalAccessTokensModule,
  ProjectTemplatesModule,
  ProjectsModule,
  FoldersModule,
  DocumentsModule,
  AgentChatModule,
  SupportModule,
  ProjectExportModule,
  TreeModule,
  VersioningModule,
  BuildModule,
  FilesModule,
  EgressProxyModule,
  EgressRoutingModule,
  IntegrationsModule,
  HealthModule,
  RunsModule,
  TasksModule,
  // Namespace-per-project tenant isolation (global — `TEMPORAL_TENANCY` for every Temporal-touching domain), ADR 0057 (private).
  TemporalModule,
  McpModule,
  AdminModule,
  // See ADR 0006 (private). `IntegrationsRuntimeService` (inside
  // `GatewayModule`) picks webhook vs. long-polling ingress per the `GATEWAY_PUBLIC_HOST` env var,
  // driving whichever of `REGISTERED_INTEGRATIONS` declare a `registerBackend` — this app supplies
  // only the generic TypeORM-backed discovery port, no vendor-specific wiring.
  GatewayModule.forRootAsync({
    integrations: REGISTERED_INTEGRATIONS,
    // `IntegrationsModule` is imported here (not just by `AppModule`) so this factory and
    // `resolveDynamicIntegrations` below can both inject its exported `ActivepiecesCatalogService` —
    // see ADR 0011 (private). `ProjectTokenModule` likewise, for
    // `resolveInternalProjectToken` below; `FilesModule` likewise, for `resolveFileUploadPort` below
    // (its own `FILE_UPLOAD_PORT` provider, see ADR 0038 (private) §2/§5).
    imports: [TypeOrmModule.forFeature([Document, Project]), IntegrationsModule, ProjectTokenModule, FilesModule],
    useFactory: (
      documents: Repository<Document>,
      config: ConfigService,
      catalog: ActivepiecesCatalogService,
      projects: Repository<Project>,
    ): IIntegrationsDiscoveryPort =>
      createIntegrationsDiscoveryPort(
        documents,
        requireEncryptionKey(config.get<string>('CREDENTIALS_ENCRYPTION_KEY')),
        projects,
        () => catalog.getDynamicIntegrations(),
      ),
    inject: [getRepositoryToken(Document), ConfigService, ActivepiecesCatalogService, getRepositoryToken(Project)],
    // ActivePieces vendors' `triggers`/`registerBackend` (see ADR 0011 (private)) are only known
    // once `ActivepiecesCatalogService` has fetched the piece catalog — an async source that can't
    // be baked into the plain `integrations` array above (evaluated here before Nest's DI phase
    // starts). Merged into `IntegrationsRuntimeService`'s integration list at construction time.
    resolveDynamicIntegrations: (catalog: ActivepiecesCatalogService) => catalog.getDynamicIntegrations(),
    dynamicInject: [ActivepiecesCatalogService],
    // Backs `ctx.getInternalProjectToken()` for every `registerBackend` this runtime drives — see
    // (pods authenticate with a per-project scoped token, not a shared secret) ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth".
    resolveInternalProjectToken: (tokens: ProjectTokenService) => (projectId: string) =>
      tokens.getOrCreateToken(projectId),
    internalProjectTokenInject: [ProjectTokenService],
    // Backs `ctx.uploadFile()` for every `registerBackend` this runtime drives (Telegram media
    // ingress today) — `FilesModule`'s own `FILE_UPLOAD_PORT` provider is `GatewayFileUploadPort`,
    // wrapping `FilesService`. See ADR 0038 (private) §2/§5.
    resolveFileUploadPort: (port: IFileUploadPort) => port,
    fileUploadInject: [FILE_UPLOAD_PORT],
  }),
];

/**
 * The application's root module. Use `AppModule.forRoot({ extraModules, extraMigrations })` — there is no plain-module
 * form; `createApp` is the one bootstrap path that composes it.
 */
@Module({})
export class AppModule {
  static forRoot(options: IAppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [...buildBuiltInImports(options.extraMigrations), ...(options.extraModules ?? [])],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    };
  }
}

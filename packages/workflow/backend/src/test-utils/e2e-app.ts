import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayModule, type IIntegrationsDiscoveryPort } from '@falang/workflow-gateway';
import request from 'supertest';
import type { TAppImport } from '../app.module.js';
import { AdminModule } from '../domains/admin/admin.module.js';
import { AppSetting } from '../domains/admin/app-settings/app-setting.entity.js';
import { OAuthCredential } from '../domains/admin/oauth-credentials/oauth-credential.entity.js';
import { UserLimits } from '../domains/admin/user-limits/user-limits.entity.js';
import { AgentChatModule } from '../domains/agent-chat/agent-chat.module.js';
import { AuthModule } from '../domains/auth/auth/auth.module.js';
import { JwtAuthGuard } from '../domains/auth/auth/jwt-auth.guard.js';
import { PersonalAccessToken } from '../domains/auth/personal-access-tokens/personal-access-token.entity.js';
import { PersonalAccessTokensModule } from '../domains/auth/personal-access-tokens/personal-access-tokens.module.js';
import { FILE_STORAGE } from '../domains/files/file-storage.js';
import { File } from '../domains/files/file.entity.js';
import { FilesModule } from '../domains/files/files.module.js';
import { InMemoryFileStorage } from '../domains/files/in-memory-file-storage.js';
import { IntegrationsModule } from '../domains/integrations/integrations.module.js';
import { IntegrationVendorData } from '../domains/integrations/vendor-data/integration-vendor-data.entity.js';
import { Document } from '../domains/projects/documents/document.entity.js';
import { DocumentsModule } from '../domains/projects/documents/documents.module.js';
import { ProjectExportModule } from '../domains/projects/export/project-export.module.js';
import { Folder } from '../domains/projects/folders/folder.entity.js';
import { FoldersModule } from '../domains/projects/folders/folders.module.js';
import { AgentUsage } from '../domains/agent-chat/agent-usage.entity.js';
import { Project } from '../domains/projects/projects/project.entity.js';
import { ProjectsModule } from '../domains/projects/projects/projects.module.js';
import { TreeModule } from '../domains/projects/tree/tree.module.js';
import { ProjectBlob } from '../domains/projects/versioning/project-blob.entity.js';
import { ProjectCommit } from '../domains/projects/versioning/project-commit.entity.js';
import { VersioningModule } from '../domains/projects/versioning/versioning.module.js';
import { SupportMessage } from '../domains/support/support-message.entity.js';
import { SupportModule } from '../domains/support/support.module.js';
import { User } from '../domains/users/users/user.entity.js';
import { UsersModule } from '../domains/users/users/users.module.js';

/** No registered integration in this test app, so `GatewayModule`'s discovery port is never meaningfully consulted. */
const noopDiscoveryPort: IIntegrationsDiscoveryPort = {
  findCredentialInstances: () => Promise.resolve([]),
  resolveCredentialFields: () => Promise.resolve() as Promise<Readonly<Record<string, string>> | undefined>,
  getDocumentsByType: () => Promise.resolve([]),
  taskQueueFor: (projectId, env) => (env === 'dev' ? `workflow-dev-${projectId}` : `workflow-${projectId}`),
  listProjectIds: () => Promise.resolve([]),
};

/**
 * The in-memory-sqlite module list shared by `createTestApp` and `createApp`-based tests
 * (`create-app.e2e.test.ts`), so neither re-declares it. `extraModules` are appended last.
 */
export const buildTestAppImports = (extraModules: TAppImport[] = []) => [
  ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
  TypeOrmModule.forRoot({
    type: 'better-sqlite3',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [
      User,
      Project,
      Folder,
      Document,
      PersonalAccessToken,
      ProjectCommit,
      ProjectBlob,
      OAuthCredential,
      AppSetting,
      IntegrationVendorData,
      UserLimits,
      File,
      AgentUsage,
      SupportMessage,
    ],
  }),
  UsersModule,
  AuthModule,
  PersonalAccessTokensModule,
  ProjectsModule,
  FoldersModule,
  DocumentsModule,
  ProjectExportModule,
  TreeModule,
  VersioningModule,
  IntegrationsModule,
  AdminModule,
  AgentChatModule,
  SupportModule,
  FilesModule,
  GatewayModule.forRoot([], noopDiscoveryPort),
  ...extraModules,
];

/**
 * Boots the real domain modules against an in-memory sqlite database (swapped in for Postgres —
 * nothing here relies on Postgres-specific behavior) so the full HTTP surface can be exercised
 * with `supertest`, including the admin auto-seed and cross-user isolation. Shared by every
 * `*.e2e.test.ts` file so each doesn't have to re-declare the same module wiring — see
 * `app.e2e.test.ts`/`integration-models.e2e.test.ts`.
 *
 * `beforeInit`, if given, runs on the constructed `app` right after `useGlobalPipes` but before
 * `app.init()` — for a caller that needs to mount something directly on the underlying Express
 * instance ahead of Nest's own router (see `mcp-test-harness.ts`'s own doc comment for why: Nest's
 * router, once attached at `init()` time, terminates any request its own controllers don't match
 * with a 404 rather than falling through to middleware registered afterward — the same ordering
 * `main.ts` already relies on for the real `/mcp` mount, done before `app.listen()` triggers `init()`).
 * `app.get(...)` is safe to call inside it: `Test.createTestingModule().compile()` already
 * instantiates the DI container's providers, `init()` only attaches the HTTP adapter's routes/middleware.
 */
export const createTestApp = async (
  beforeInit?: (app: INestApplication) => void | Promise<void>,
): Promise<INestApplication> => {
  // Signup is off by default in production; most suites register users through the API, so the
  // harness opts in unless a test explicitly set the flag first (`vi.stubEnv` after this call wins).
  process.env.SELF_SERVICE_SIGNUP ??= 'true';
  const moduleRef = await Test.createTestingModule({
    imports: buildTestAppImports(),
    providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
  })
    // `FilesModule`'s real `FILE_STORAGE` provider is `S3FileStorage`, which needs a real bucket —
    // swapped for an in-memory `IFileStorage` so `FilesModule`'s HTTP surface (and anything that
    // depends on `FilesService`, e.g. `BuildService.deleteProject`) is exercisable without MinIO.
    // See ADR 0038 (private) §2.
    .overrideProvider(FILE_STORAGE)
    .useValue(new InMemoryFileStorage())
    .compile();

  // `rawBody: true` — matches `main.ts`'s own bootstrap option, so `req.rawBody` is populated the
  // same way in tests as in the real app whenever a request's `content-type` happens to match
  // Nest's default json/urlencoded body-parser middleware (see `upload-request.ts`'s `rawUploadBody`
  // doc comment) — needed for `files.e2e.test.ts`'s own "upload whose mime is application/json" case.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await beforeInit?.(app);
  await app.init();
  return app;
};

export const login = async (app: INestApplication, username = 'admin', password = 'admin'): Promise<string> => {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ username, password });
  return (response.body as { accessToken: string }).accessToken;
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

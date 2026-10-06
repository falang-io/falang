// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import 'reflect-metadata';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { AppSetting } from './domains/admin/app-settings/app-setting.entity.js';
import { OAuthCredential } from './domains/admin/oauth-credentials/oauth-credential.entity.js';
import { UserLimits } from './domains/admin/user-limits/user-limits.entity.js';
import { ProjectVersion } from './domains/build/build/project-version.entity.js';
import { File } from './domains/files/file.entity.js';
import { IntegrationVendorData } from './domains/integrations/vendor-data/integration-vendor-data.entity.js';
import { Document } from './domains/projects/documents/document.entity.js';
import { Folder } from './domains/projects/folders/folder.entity.js';
import { Project } from './domains/projects/projects/project.entity.js';
import { ProjectBlob } from './domains/projects/versioning/project-blob.entity.js';
import { ProjectCommit } from './domains/projects/versioning/project-commit.entity.js';
import { AgentUsage } from './domains/agent-chat/agent-usage.entity.js';
import { RunJournalEntry } from './domains/run-journal/run-journal-entry.entity.js';
import { Task } from './domains/tasks/task.entity.js';
import { User } from './domains/users/users/user.entity.js';

/**
 * Standalone DataSource for the TypeORM CLI (`npm run migration:*`, see package.json). Kept
 * separate from `AppModule`'s `TypeOrmModule.forRootAsync`, which relies on Nest's
 * `autoLoadEntities` instead of an explicit list — the CLI runs outside Nest's DI and needs
 * entities up front. `migrations` glob matches `AppModule`'s own `migrations` option so both
 * pick up the same files; both point at `.ts` sources directly since this repo has no build step
 * and runs everything through `tsx`.
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'falang',
  password: process.env.DB_PASSWORD ?? 'falang',
  database: process.env.DB_NAME ?? 'falang_workflow',
  entities: [
    User,
    Project,
    Folder,
    Document,
    ProjectVersion,
    ProjectCommit,
    ProjectBlob,
    OAuthCredential,
    AppSetting,
    IntegrationVendorData,
    UserLimits,
    File,
    Task,
    AgentUsage,
    RunJournalEntry,
  ],
  migrations: [path.join(__dirname, 'migrations', '*.ts')],
});

export default AppDataSource;

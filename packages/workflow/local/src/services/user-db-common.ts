// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename/__dirname are correct here.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Shared bits of the two "user's own database" test fixtures (`postgres-user-db`, `mysql-user-db`): the fixed
 * credentials the e2e spec expects, the seed files, the env contract and lazy loading of the dev-only libraries.
 */

/** Same credentials and database as `docker-compose.workflow-e2e.yml`'s `postgres-user-db`/`mysql-user-db`. */
export const USER_DB_USER = 'falang';
export const USER_DB_PASSWORD = 'falang';
export const USER_DB_NAME = 'userdb';
/** The fixtures listen on loopback only. */
export const USER_DB_HOST = '127.0.0.1';

export type TUserDbDialect = 'postgres' | 'mysql';

export const buildUserDbUrl = (dialect: TUserDbDialect, port: number, host: string = USER_DB_HOST): string =>
  `${dialect}://${USER_DB_USER}:${USER_DB_PASSWORD}@${host}:${port}/${USER_DB_NAME}`;

/**
 * The variables `@falang/workflow-backend`'s `test-utils/workflow-e2e-client.ts` reads: the URL the test process
 * connects to directly and the one seeded into the credential (backend "Sync structure" + runner processes). In the
 * local mode everything runs on this machine, so both are the same loopback URL.
 */
export const buildUserDbTestEnv = (dialect: TUserDbDialect, url: string): Record<string, string> => {
  const prefix = dialect === 'postgres' ? 'E2E_POSTGRES_USER_DB' : 'E2E_MYSQL_USER_DB';
  return { [`${prefix}_URL`]: url, [`${prefix}_RUNNER_URL`]: url };
};

/** `docker/e2e-seed/` of the monorepo checkout (`src/services` → repo root is five levels up). */
export const USER_DB_SEED_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', 'docker', 'e2e-seed');

/** The seed file of `dialect`; throws when the repository's `docker/e2e-seed/` is not there (a packaged install). */
export const resolveUserDbSeedFile = (dialect: TUserDbDialect, seedDir: string = USER_DB_SEED_DIR): string => {
  const file = path.join(seedDir, `${dialect}-user-db.sql`);
  if (!existsSync(file)) {
    throw new Error(
      `${dialect}-user-db: seed file ${file} not found — this test fixture needs the monorepo checkout ` +
        '(docker/e2e-seed/), it is not part of a packaged local mode',
    );
  }
  return file;
};

/**
 * Resolves a dev-only dependency of this package (the user-db fixtures are devDependencies: the local mode shipped
 * in the desktop app installs production dependencies only). Returns the resolved entry file or throws a message
 * that says what to install.
 */
export const resolveDevDependency = (
  service: string,
  specifier: string,
  resolve: (specifier: string) => string = createRequire(__filename).resolve,
): string => {
  try {
    return resolve(specifier);
  } catch (error) {
    throw new Error(
      `${service} needs the dev dependency "${specifier}" of @falang/workflow-local, which is not installed ` +
        '(it is a test fixture: run `npm install` in the monorepo checkout, devDependencies included)',
      { cause: error },
    );
  }
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

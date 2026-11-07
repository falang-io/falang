// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename is the correct tool here.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startSupervisedProcess } from './supervisor.js';
import type { ILocalService, ILocalServiceContext } from './types.js';
import {
  USER_DB_HOST,
  USER_DB_NAME,
  USER_DB_PASSWORD,
  USER_DB_USER,
  buildUserDbTestEnv,
  buildUserDbUrl,
  resolveDevDependency,
  resolveUserDbSeedFile,
  sleep,
} from './user-db-common.js';

/**
 * `postgres-user-db`: a real PostgreSQL server standing in for "the user's own database" in the e2e suites
 * (`integrations-databases.workflow-e2e-spec.ts`, the kind stack's `postgres-user-db` container). Binaries come from
 * the `embedded-postgres` dev dependency (its per-OS `@embedded-postgres/<platform>-<arch>` package, Postgres 18);
 * only the binaries are used — the package's own API registers process-wide exit hooks that would cut the local
 * mode's graceful shutdown short. PGlite + `pglite-socket` was rejected: it multiplexes every client onto PGlite's
 * single session per protocol message, so concurrent extended-protocol queries corrupt each other's unnamed
 * statements/portals (see the ADR 0072 (private) phase-3 notes).
 *
 * Data lives in `<service dataDir>/pgdata` (initialised and seeded once with `docker/e2e-seed/postgres-user-db.sql`,
 * reused on later starts of the same data directory). Listens on `127.0.0.1:<free port>` only, no unix socket.
 */

export const POSTGRES_USER_DB_SERVICE = 'postgres-user-db';

/** npm's platform name of the binaries package for this OS/CPU (`win32` is published as `windows`). */
export const embeddedPostgresPlatformPackage = (
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string => `@embedded-postgres/${platform === 'win32' ? 'windows' : platform}-${arch}`;

export interface IPostgresBinaries {
  readonly initdb: string;
  readonly postgres: string;
}

/** Loads the binaries' paths from `embedded-postgres`' platform package (lazily: a dev dependency). */
export const loadPostgresBinaries = async (): Promise<IPostgresBinaries> => {
  const mainEntry = resolveDevDependency(POSTGRES_USER_DB_SERVICE, 'embedded-postgres');
  const platformPackage = embeddedPostgresPlatformPackage();
  const platformEntry = resolveDevDependency(POSTGRES_USER_DB_SERVICE, platformPackage, (specifier) =>
    createRequire(mainEntry).resolve(specifier),
  );
  const binaries = (await import(pathToFileURL(platformEntry).href)) as Partial<IPostgresBinaries>;
  if (typeof binaries.initdb !== 'string' || typeof binaries.postgres !== 'string') {
    throw new TypeError(`${POSTGRES_USER_DB_SERVICE}: ${platformPackage} does not export initdb/postgres paths`);
  }
  return { initdb: binaries.initdb, postgres: binaries.postgres };
};

/** Arguments of the `postgres` server process: loopback TCP only, unix sockets off (path-length and permission free). */
export const buildPostgresArgs = (pgdata: string, port: number): string[] => [
  '-D',
  pgdata,
  '-p',
  String(port),
  '-c',
  `listen_addresses=${USER_DB_HOST}`,
  '-c',
  'unix_socket_directories=',
  '-c',
  'fsync=off',
  '-c',
  'log_min_messages=warning',
];

const runOnce = (command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    const collect = (chunk: Buffer): void => {
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (code ${code}, signal ${signal}):\n${output.trim()}`));
    });
  });

/** pg's `Client` constructor, loaded lazily (a dev dependency of this package). */
type TPgClientCtor = new (config: { connectionString: string }) => {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
};

const loadPgClient = async (): Promise<TPgClientCtor> => {
  resolveDevDependency(POSTGRES_USER_DB_SERVICE, 'pg');
  const pg = (await import('pg')) as unknown as { Client?: TPgClientCtor; default?: { Client: TPgClientCtor } };
  const Client = pg.Client ?? pg.default?.Client;
  if (!Client) throw new Error(`${POSTGRES_USER_DB_SERVICE}: the "pg" module has no Client export`);
  return Client;
};

/** Runs `fn` with a connected client, retrying the connection while the server is still starting up. */
const withClient = async <T>(
  Client: TPgClientCtor,
  connectionString: string,
  fn: (client: InstanceType<TPgClientCtor>) => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = new Client({ connectionString });
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry until the server accepts sessions
      await client.connect();
    } catch (error) {
      // oxlint-disable-next-line no-await-in-loop -- see above
      await client.end().catch(() => null);
      if (Date.now() > deadline) throw error;
      // oxlint-disable-next-line no-await-in-loop -- see above
      await sleep(200);
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one successful attempt ends the loop
      return await fn(client);
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- see above
      await client.end().catch(() => null);
    }
  }
};

const SEEDED_MARKER = '.falang-seeded';

export const postgresUserDbService: ILocalService = {
  name: 'postgres-user-db',
  async start(ctx: ILocalServiceContext) {
    const binaries = await loadPostgresBinaries();
    const Client = await loadPgClient();
    const seedFile = resolveUserDbSeedFile('postgres');
    const pgdata = path.join(ctx.dataDir, 'pgdata');
    const seededMarker = path.join(ctx.dataDir, SEEDED_MARKER);
    const childEnv: NodeJS.ProcessEnv = { ...ctx.childEnv, LC_ALL: 'C', LC_MESSAGES: 'C' };

    if (!existsSync(path.join(pgdata, 'PG_VERSION'))) {
      // A half-initialised directory from an interrupted first start would make initdb refuse to run.
      await rm(pgdata, { recursive: true, force: true });
      await rm(seededMarker, { force: true });
      const passwordFile = path.join(ctx.dataDir, 'initdb-password');
      await writeFile(passwordFile, `${USER_DB_PASSWORD}\n`, { mode: 0o600 });
      ctx.log(`[${POSTGRES_USER_DB_SERVICE}] initialising ${pgdata}`);
      try {
        await runOnce(
          binaries.initdb,
          [
            `--pgdata=${pgdata}`,
            `--username=${USER_DB_USER}`,
            `--pwfile=${passwordFile}`,
            '--auth=scram-sha-256',
            '--encoding=UTF8',
            '--no-locale',
          ],
          childEnv,
        );
      } finally {
        await rm(passwordFile, { force: true });
      }
    }

    const port = await ctx.findFreePort();
    let stopping = false;
    const server = await startSupervisedProcess({
      name: POSTGRES_USER_DB_SERVICE,
      command: binaries.postgres,
      args: buildPostgresArgs(pgdata, port),
      env: childEnv,
      log: ctx.log,
      ready: { host: USER_DB_HOST, port },
      readyTimeoutMs: 60_000,
      onUnexpectedExit: (error) => {
        if (!stopping) ctx.log(`[${POSTGRES_USER_DB_SERVICE}] ${error.message}`);
      },
    });

    // SIGINT = Postgres' "fast" shutdown (SIGTERM, the supervisor's signal, would wait for every client to leave).
    const stop = async (): Promise<void> => {
      stopping = true;
      if (typeof server.pid === 'number') {
        try {
          process.kill(server.pid, 'SIGINT');
        } catch {
          // already gone
        }
        await Promise.race([server.exited, sleep(10_000)]);
      }
      await server.stop();
    };

    try {
      const url = buildUserDbUrl('postgres', port);
      if (existsSync(seededMarker)) {
        // The server accepts TCP before it accepts sessions; wait until it does.
        await withClient(Client, url, (client) => client.query('SELECT 1'));
      } else {
        const adminUrl = `postgres://${USER_DB_USER}:${USER_DB_PASSWORD}@${USER_DB_HOST}:${port}/postgres`;
        await withClient(Client, adminUrl, (client) => client.query(`CREATE DATABASE ${USER_DB_NAME}`));
        const seedSql = await readFile(seedFile, 'utf8');
        await withClient(Client, url, (client) => client.query(seedSql));
        await writeFile(seededMarker, `${new Date().toISOString()}\n`);
      }
      ctx.log(
        `[${POSTGRES_USER_DB_SERVICE}] test fixture database ready: ${url}${
          ctx.testMode ? '' : ' (fixed test credentials, loopback only — not for real data)'
        }`,
      );
      return {
        testEnv: buildUserDbTestEnv('postgres', url),
        capabilities: ['postgres-user-db'],
        stop,
      };
    } catch (error) {
      await stop();
      throw error;
    }
  },
};

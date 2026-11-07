// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here.
import os from 'node:os';
import path from 'node:path';
import {
  MYSQL_USER_DB_CONFIG_ENV,
  MYSQL_USER_DB_VERSION,
  buildMysqlInitSql,
  parseMysqlReadyLine,
  type IMysqlUserDbChildConfig,
  type IMysqlUserDbReady,
} from './mysql-user-db-config.js';
import { startSupervisedProcess, tsxEntryCommand } from './supervisor.js';
import type { ILocalService, ILocalServiceContext } from './types.js';
import {
  USER_DB_NAME,
  USER_DB_USER,
  buildUserDbTestEnv,
  buildUserDbUrl,
  resolveDevDependency,
  resolveUserDbSeedFile,
} from './user-db-common.js';

/**
 * `mysql-user-db`: a real MySQL 8.4 server standing in for "the user's own database" in the e2e suites (the kind
 * stack's `mysql-user-db` container). There is no maintained WASM MySQL, so this uses the `mysql-memory-server` dev
 * dependency: it downloads the official MySQL binaries from cdn.mysql.com on first use (~400 MB extracted, ~1 min)
 * into `<os tmpdir>/mysqlmsn/binaries/<version>` and reuses them on later runs (until the temp directory is
 * cleared); a system MySQL matching the version is used instead when installed. The database itself is ephemeral
 * (`<os tmpdir>/mysqlmsn/dbs/<uuid>`, deleted on stop) and re-seeded with `docker/e2e-seed/mysql-user-db.sql` on every
 * start. The library runs in a child process (`mysql-user-db-child.ts`) because its `signal-exit` handlers would end
 * the local mode's process on the first signal.
 */

export const MYSQL_USER_DB_SERVICE = 'mysql-user-db';

/** First start downloads MySQL; later starts take ~8 s. */
const MYSQL_READY_TIMEOUT_MS = 20 * 60_000;

const CHILD_ENTRY = path.join(__dirname, 'mysql-user-db-child.ts');

export const mysqlUserDbService: ILocalService = {
  name: 'mysql-user-db',
  async start(ctx: ILocalServiceContext) {
    resolveDevDependency(MYSQL_USER_DB_SERVICE, 'mysql-memory-server');
    const seedFile = resolveUserDbSeedFile('mysql');
    const port = await ctx.findFreePort();
    const config: IMysqlUserDbChildConfig = {
      version: MYSQL_USER_DB_VERSION,
      port,
      database: USER_DB_NAME,
      user: USER_DB_USER,
      initSql: buildMysqlInitSql(),
      seedFile,
    };
    ctx.log(
      `[${MYSQL_USER_DB_SERVICE}] starting MySQL ${MYSQL_USER_DB_VERSION} (the first start downloads it into ` +
        `${path.join(os.tmpdir(), 'mysqlmsn', 'binaries')}, ~400 MB)`,
    );

    const { promise: ready, resolve: resolveReady } = Promise.withResolvers<IMysqlUserDbReady>();
    const child = await startSupervisedProcess({
      name: MYSQL_USER_DB_SERVICE,
      ...tsxEntryCommand(CHILD_ENTRY),
      env: { ...ctx.childEnv, [MYSQL_USER_DB_CONFIG_ENV]: JSON.stringify(config) },
      log: (line) => {
        const parsed = parseMysqlReadyLine(line);
        if (parsed) resolveReady(parsed);
        ctx.log(line);
      },
      onUnexpectedExit: (error) => ctx.log(`[${MYSQL_USER_DB_SERVICE}] ${error.message}`),
    });

    let timer: NodeJS.Timeout | null = null;
    const outcome = await Promise.race([
      ready.then((value) => ({ kind: 'ready' as const, value })),
      child.exited.then((exit) => ({ kind: 'exited' as const, exit })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), MYSQL_READY_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (outcome.kind !== 'ready') {
      await child.stop();
      const reason =
        outcome.kind === 'exited'
          ? `exited (code ${outcome.exit.code}, signal ${outcome.exit.signal}) before it was ready`
          : `was not ready within ${MYSQL_READY_TIMEOUT_MS} ms`;
      throw new Error(`${MYSQL_USER_DB_SERVICE} ${reason}; last output:\n${child.outputTail().join('\n')}`);
    }

    const url = buildUserDbUrl('mysql', outcome.value.port);
    ctx.log(
      `[${MYSQL_USER_DB_SERVICE}] test fixture database ready (MySQL ${outcome.value.version}): ${url}${
        ctx.testMode ? '' : ' (fixed test credentials, loopback only, wiped on stop)'
      }`,
    );
    return {
      testEnv: buildUserDbTestEnv('mysql', url),
      capabilities: ['mysql-user-db'],
      stop: () => child.stop(),
    };
  },
};

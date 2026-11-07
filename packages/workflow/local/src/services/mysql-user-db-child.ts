// oxlint-disable no-console, unicorn/no-process-exit -- a child-process entry point: stdout is its protocol and exit codes its result.
/**
 * Child process of the `mysql-user-db` local service: runs `mysql-memory-server`'s `createDB` (downloads MySQL on
 * first use) and keeps it up until SIGTERM/SIGINT. It runs in its own process because `mysql-memory-server`
 * installs `signal-exit` handlers that would end the local mode's own process on its first signal.
 *
 * Input (env): `FALANG_MYSQL_USER_DB_CONFIG` = JSON `IMysqlUserDbChildConfig`. Output: one stdout line
 * `MYSQL_USER_DB_READY <json { port, version, downloaded }>` once the server accepts connections.
 */
import {
  MYSQL_USER_DB_CONFIG_ENV,
  MYSQL_USER_DB_READY_PREFIX,
  parseMysqlUserDbChildConfig,
} from './mysql-user-db-config.js';

interface IMysqlMemoryServerDb {
  readonly port: number;
  readonly mysql: { readonly version: string; readonly versionIsInstalledOnSystem: boolean };
  stop(): Promise<void>;
}

type TCreateDb = (options: Record<string, unknown>) => Promise<IMysqlMemoryServerDb>;

const main = async (): Promise<void> => {
  const config = parseMysqlUserDbChildConfig(process.env[MYSQL_USER_DB_CONFIG_ENV]);
  const mod = (await import('mysql-memory-server')) as unknown as {
    createDB?: TCreateDb;
    default?: { createDB: TCreateDb };
  };
  const createDB = mod.createDB ?? mod.default?.createDB;
  if (!createDB) throw new Error('mysql-memory-server has no createDB export');
  const db = await createDB({
    version: config.version,
    port: config.port,
    dbName: config.database,
    username: config.user,
    xEnabled: 'OFF',
    logLevel: 'WARN',
    initSQLString: config.initSql,
    initSQLFilePath: config.seedFile,
  });
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    db.stop()
      .catch((error: unknown) => console.error(`stop failed: ${String(error)}`))
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  console.log(
    `${MYSQL_USER_DB_READY_PREFIX} ${JSON.stringify({
      port: db.port,
      version: db.mysql.version,
      downloaded: !db.mysql.versionIsInstalledOnSystem,
    })}`,
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});

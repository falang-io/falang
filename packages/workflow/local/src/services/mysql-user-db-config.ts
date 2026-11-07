import { USER_DB_NAME, USER_DB_PASSWORD, USER_DB_USER } from './user-db-common.js';

/** The JSON contract between the `mysql-user-db` service and its child process (`mysql-user-db-child.ts`). */
export interface IMysqlUserDbChildConfig {
  /** A semver range `mysql-memory-server` resolves (a system MySQL matching it is used instead of a download). */
  readonly version: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  /** Run by `--init-file` after the library has created `user`@`localhost` and `database`. */
  readonly initSql: string;
  /** Appended to the init file after `initSql`. */
  readonly seedFile: string;
}

export const MYSQL_USER_DB_CONFIG_ENV = 'FALANG_MYSQL_USER_DB_CONFIG';
export const MYSQL_USER_DB_READY_PREFIX = 'MYSQL_USER_DB_READY';

/** Same major line as the kind stack's `mysql:8` image (8.4 is the 8.x LTS). */
export const MYSQL_USER_DB_VERSION = '8.4.x';

/**
 * `mysql-memory-server` creates `<user>@localhost` without a password; the spec connects over TCP as
 * `falang:falang`, which MySQL matches as `<user>@127.0.0.1`/`%`. Sets the password and adds the `%` account, then
 * selects the database so the appended seed file creates its tables there.
 */
export const buildMysqlInitSql = (
  user: string = USER_DB_USER,
  password: string = USER_DB_PASSWORD,
  database: string = USER_DB_NAME,
): string =>
  [
    `ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';`,
    `CREATE USER '${user}'@'%' IDENTIFIED BY '${password}';`,
    `GRANT ALL ON \`${database}\`.* TO '${user}'@'%';`,
    `USE \`${database}\`;`,
  ].join('\n');

export const parseMysqlUserDbChildConfig = (raw: string | undefined): IMysqlUserDbChildConfig => {
  if (!raw) throw new Error(`${MYSQL_USER_DB_CONFIG_ENV} is not set`);
  const value = JSON.parse(raw) as Partial<IMysqlUserDbChildConfig>;
  for (const key of ['version', 'database', 'user', 'initSql', 'seedFile'] as const) {
    if (typeof value[key] !== 'string') throw new Error(`${MYSQL_USER_DB_CONFIG_ENV}.${key} must be a string`);
  }
  if (typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port <= 0) {
    throw new Error(`${MYSQL_USER_DB_CONFIG_ENV}.port must be a positive integer`);
  }
  return value as IMysqlUserDbChildConfig;
};

export interface IMysqlUserDbReady {
  readonly port: number;
  readonly version: string;
  readonly downloaded: boolean;
}

/** The child's ready line (`MYSQL_USER_DB_READY {…}`), or `null` for any other output line. */
export const parseMysqlReadyLine = (line: string): IMysqlUserDbReady | null => {
  const index = line.indexOf(`${MYSQL_USER_DB_READY_PREFIX} `);
  if (index === -1) return null;
  try {
    const value = JSON.parse(line.slice(index + MYSQL_USER_DB_READY_PREFIX.length + 1)) as Partial<IMysqlUserDbReady>;
    if (typeof value.port !== 'number' || typeof value.version !== 'string') return null;
    return { port: value.port, version: value.version, downloaded: value.downloaded === true };
  } catch {
    return null;
  }
};

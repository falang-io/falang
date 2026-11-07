import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findFreePort } from '../temporal/temporal-dev-server.js';
import {
  MYSQL_USER_DB_CONFIG_ENV,
  buildMysqlInitSql,
  parseMysqlReadyLine,
  parseMysqlUserDbChildConfig,
} from './mysql-user-db-config.js';
import { buildPostgresArgs, embeddedPostgresPlatformPackage, postgresUserDbService } from './postgres-user-db.js';
import type { ILocalServiceContext } from './types.js';
import {
  USER_DB_SEED_DIR,
  buildUserDbTestEnv,
  buildUserDbUrl,
  resolveDevDependency,
  resolveUserDbSeedFile,
} from './user-db-common.js';

const failingResolve = (): string => {
  throw new Error('Cannot find module');
};

describe('user-db common helpers', () => {
  it('builds the fixed-credential URLs the e2e spec and sql-common accept', () => {
    expect(buildUserDbUrl('postgres', 5435)).toBe('postgres://falang:falang@127.0.0.1:5435/userdb');
    expect(buildUserDbUrl('mysql', 3308, 'localhost')).toBe('mysql://falang:falang@localhost:3308/userdb');
  });

  it('exposes the same URL to the test process and the runner', () => {
    expect(buildUserDbTestEnv('postgres', 'u')).toEqual({
      E2E_POSTGRES_USER_DB_URL: 'u',
      E2E_POSTGRES_USER_DB_RUNNER_URL: 'u',
    });
    expect(buildUserDbTestEnv('mysql', 'm')).toEqual({ E2E_MYSQL_USER_DB_URL: 'm', E2E_MYSQL_USER_DB_RUNNER_URL: 'm' });
  });

  it('finds the repository seed files and explains a missing one', () => {
    expect(resolveUserDbSeedFile('postgres')).toBe(path.join(USER_DB_SEED_DIR, 'postgres-user-db.sql'));
    expect(resolveUserDbSeedFile('mysql')).toBe(path.join(USER_DB_SEED_DIR, 'mysql-user-db.sql'));
    expect(() => resolveUserDbSeedFile('mysql', '/nonexistent')).toThrow(/monorepo checkout/);
  });

  it('turns a missing dev dependency into an actionable error', () => {
    expect(() => resolveDevDependency('postgres-user-db', 'embedded-postgres', failingResolve)).toThrow(
      /postgres-user-db needs the dev dependency "embedded-postgres".*npm install/,
    );
    expect(resolveDevDependency('x', 'y', () => '/path/y.js')).toBe('/path/y.js');
  });
});

describe('postgres-user-db helpers', () => {
  it('maps the OS/CPU to embedded-postgres platform packages', () => {
    expect(embeddedPostgresPlatformPackage('linux', 'x64')).toBe('@embedded-postgres/linux-x64');
    expect(embeddedPostgresPlatformPackage('darwin', 'arm64')).toBe('@embedded-postgres/darwin-arm64');
    expect(embeddedPostgresPlatformPackage('win32', 'x64')).toBe('@embedded-postgres/windows-x64');
  });

  it('listens on loopback TCP only', () => {
    const args = buildPostgresArgs('/data', 6000);
    expect(args.slice(0, 4)).toEqual(['-D', '/data', '-p', '6000']);
    expect(args).toContain('listen_addresses=127.0.0.1');
    expect(args).toContain('unix_socket_directories=');
  });
});

describe('mysql-user-db child contract', () => {
  it('gives the falang user a password and a TCP account, then selects the database', () => {
    const sql = buildMysqlInitSql('u', 'p', 'd');
    expect(sql).toContain("ALTER USER 'u'@'localhost' IDENTIFIED BY 'p';");
    expect(sql).toContain("CREATE USER 'u'@'%' IDENTIFIED BY 'p';");
    expect(sql.trim().endsWith('USE `d`;')).toBe(true);
  });

  it('parses and validates the child config', () => {
    const config = { version: '8.4.x', port: 3307, database: 'd', user: 'u', initSql: 's', seedFile: '/f.sql' };
    expect(parseMysqlUserDbChildConfig(JSON.stringify(config))).toEqual(config);
    expect(() => parseMysqlUserDbChildConfig('')).toThrow(MYSQL_USER_DB_CONFIG_ENV);
    expect(() => parseMysqlUserDbChildConfig(JSON.stringify({ ...config, port: 0 }))).toThrow(/port/);
    expect(() => parseMysqlUserDbChildConfig(JSON.stringify({ ...config, seedFile: 1 }))).toThrow(/seedFile/);
  });

  it('recognises the ready line, also with the supervisor prefix', () => {
    expect(
      parseMysqlReadyLine('[mysql-user-db] MYSQL_USER_DB_READY {"port":1,"version":"8.4.9","downloaded":true}'),
    ).toEqual({ port: 1, version: '8.4.9', downloaded: true });
    expect(parseMysqlReadyLine('MYSQL_USER_DB_READY not-json')).toBeNull();
    expect(parseMysqlReadyLine('[mysql-user-db] something else')).toBeNull();
  });
});

const postgresAvailable = ((): boolean => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return false;
  try {
    resolveDevDependency('test', 'embedded-postgres');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!postgresAvailable)('postgres-user-db (real server)', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('initialises, seeds, serves the spec URL and restarts on the same data directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'falang-pg-user-db-'));
    dirs.push(root);
    const dataDir = path.join(root, 'services', 'postgres-user-db');
    await mkdir(dataDir, { recursive: true });
    const ctx: ILocalServiceContext = {
      name: 'postgres-user-db',
      dataDir,
      rootDataDir: root,
      log: () => null,
      findFreePort: (host) => findFreePort(host),
      publicUrl: 'http://localhost:1',
      internalUrl: 'http://127.0.0.1:2',
      testMode: true,
      childEnv: process.env,
      getSecret: () => Promise.resolve('secret'),
    };
    const { Client } = await import('pg');
    for (let round = 0; round < 2; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- start, query and stop the same data directory twice
      const handle = await postgresUserDbService.start(ctx);
      expect(handle.capabilities).toEqual(['postgres-user-db']);
      const url = handle.testEnv?.E2E_POSTGRES_USER_DB_URL ?? '';
      const client = new Client({ connectionString: url });
      try {
        // oxlint-disable-next-line no-await-in-loop -- see above
        await client.connect();
        // oxlint-disable-next-line no-await-in-loop -- see above
        const result = await client.query<{ c: string }>('SELECT count(*) AS c FROM orders');
        expect(Number(result.rows[0].c)).toBe(2);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- see above
        await client.end();
        // oxlint-disable-next-line no-await-in-loop -- see above
        await handle.stop();
      }
    }
  }, 60_000);
});

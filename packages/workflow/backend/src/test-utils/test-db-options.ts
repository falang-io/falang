import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';
import { queuedPgliteDriver } from './queued-pglite-driver.js';
import { TEST_MIGRATIONS } from './test-migrations.js';

/**
 * Which database the backend test harnesses (`e2e-app.ts`, `tasks-test-harness.ts`) run on, chosen by
 * `FALANG_TEST_DB`:
 * - unset / `sqlite` — the in-memory `better-sqlite3` the suite has always used;
 * - `pglite` — a real (WASM) Postgres, schema from `synchronize: true`;
 * - `pglite-migrations` — the same, but the schema comes from the real `src/migrations/*.ts` (as static imports —
 *   TypeORM's glob loads `.ts` files through Node's own loader, which fails under vitest), so the migrations
 *   themselves are what gets exercised.
 *
 * `FALANG_TEST_DB_DRIVER`: `queued` (default) — `queued-pglite-driver.ts`, the one session handed to one holder at a
 * time; `stock` — `typeorm-pglite`'s own pool, which lets concurrent transactions interleave on the single session
 * (see `pglite-migrations-probe.test.ts`). Local-mode spike, 2026-10-31.
 */
export type TTestDb = 'sqlite' | 'pglite' | 'pglite-migrations';

export const resolveTestDb = (): TTestDb => {
  const value = process.env.FALANG_TEST_DB ?? 'sqlite';
  if (value === 'sqlite' || value === 'pglite' || value === 'pglite-migrations') return value;
  throw new Error(`Unknown FALANG_TEST_DB "${value}" (expected sqlite | pglite | pglite-migrations)`);
};

/**
 * Runs before every real migration (timestamp 0): the migrations assume `uuid-ossp` exists, which on a real
 * Postgres is created once by the DBA/TypeORM's synchronize; after the harness's `dropSchema` it's gone.
 */
class UuidOsspExtension1000000000000 implements MigrationInterface {
  name = 'UuidOsspExtension1000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}

let pgliteDriver: unknown = null;

const getPgliteDriver = (): unknown => {
  // The WASM engine itself is only loaded on the first connection, so the default sqlite run never pays for it.
  pgliteDriver ??=
    (process.env.FALANG_TEST_DB_DRIVER ?? 'queued') === 'stock'
      ? new PGliteDriver({ extensions: { uuid_ossp } }).driver
      : queuedPgliteDriver({ extensions: { uuid_ossp } });
  return pgliteDriver;
};

/** The `type`/`database`/schema part of a harness's `TypeOrmModule.forRoot` options; the caller adds `entities`. */
export const buildTestDbOptions = (): TypeOrmModuleOptions => {
  const db = resolveTestDb();
  if (db === 'sqlite') {
    return { type: 'better-sqlite3', database: ':memory:', dropSchema: true, synchronize: true };
  }
  const base = { type: 'postgres', driver: getPgliteDriver(), dropSchema: true } as const;
  if (db === 'pglite') return { ...base, synchronize: true } as TypeOrmModuleOptions;
  return {
    ...base,
    synchronize: false,
    migrationsRun: true,
    migrations: [UuidOsspExtension1000000000000, ...TEST_MIGRATIONS],
  } as TypeOrmModuleOptions;
};

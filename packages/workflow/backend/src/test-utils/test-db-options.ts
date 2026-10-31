import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { PGliteDriver } from 'typeorm-pglite';
// Dev-only cycle backend <-> local is intended: the product-side PGlite driver lives in `@falang/workflow-local`.
import { queuedPgliteDriver, UuidOsspExtensionMigration } from '@falang/workflow-local';
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
 * `FALANG_TEST_DB_DRIVER`: `queued` (default) — `@falang/workflow-local`'s queued driver, the one session handed to one holder at a
 * time; `stock` — `typeorm-pglite`'s own pool, which lets concurrent transactions interleave on the single session
 * (see `pglite-migrations-probe.test.ts`). Local-mode spike, 2026-10-31.
 */
export type TTestDb = 'sqlite' | 'pglite' | 'pglite-migrations';

export const resolveTestDb = (): TTestDb => {
  const value = process.env.FALANG_TEST_DB ?? 'sqlite';
  if (value === 'sqlite' || value === 'pglite' || value === 'pglite-migrations') return value;
  throw new Error(`Unknown FALANG_TEST_DB "${value}" (expected sqlite | pglite | pglite-migrations)`);
};

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
    migrations: [UuidOsspExtensionMigration, ...TEST_MIGRATIONS],
  } as TypeOrmModuleOptions;
};

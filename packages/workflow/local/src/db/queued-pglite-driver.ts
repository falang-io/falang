/* A TypeORM `postgres`-dialect driver over one PGlite instance (Postgres in WASM) with real connection checkout.
 * `typeorm-pglite`'s pool and `pglite-socket` hand every caller the same session at once, so two concurrent TypeORM
 * transactions interleave their BEGIN/COMMIT/ROLLBACK. Here `connect` gives the single session to one holder at a
 * time and queues the rest; TypeORM releases it after each query/transaction (ADR 0072 (private)). Each driver owns
 * its own PGlite instance, so two data directories never share one. Two fixes for PGlite's parsing/serialization
 * live here as well: booleans are sent as `TRUE`/`FALSE` (the default `'t'`/`'f'` text is rejected by a `boolean`
 * parameter), and `timestamp without time zone` (OID 1114) is read back as UTC rather than host-local time. */
// oxlint-disable max-classes-per-file -- the pool, the per-driver subclass and the migration belong together.
// oxlint-disable unicorn/prefer-event-target -- TypeORM's postgres driver expects node-postgres-shaped `Pool`/`Client` emitters.
import { EventEmitter } from 'node:events';
import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import type { MigrationInterface, QueryRunner } from 'typeorm';

type TCb<T> = (err: Error | null, result?: T) => void;

/** The pool-shaped class TypeORM instantiates (`new driver.Pool(config)`). */
export type IQueuedPglitePoolClass = new (config?: unknown) => QueuedPGlitePool;

export class QueuedPGlitePool extends EventEmitter {
  private busy = false;
  private readonly waiters: (() => void)[] = [];

  private readonly state: { options: PGliteOptions; instance: Promise<PGlite> | null };

  constructor(state: { options: PGliteOptions; instance: Promise<PGlite> | null }) {
    super();
    this.state = state;
  }

  private db(): Promise<PGlite> {
    this.state.instance ??= PGlite.create(this.state.options);
    return this.state.instance;
  }

  /** TypeORM calls `pool.connect((err, connection, release) => …)`; the connection must expose `query`. */
  connect(callback: (err: Error | null, connection: unknown, release: () => void) => void): void {
    const grant = () => {
      this.busy = true;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.busy = false;
        const next = this.waiters.shift();
        if (next) next();
      };
      this.db().then(
        () => callback(null, this.connection, release),
        (error: Error) => {
          release();
          callback(error, null, () => {
            /* nothing to release */
          });
        },
      );
    };
    if (this.busy) this.waiters.push(grant);
    else grant();
  }

  /** TypeORM subscribes to `connection.on('error')`, so the handed-out connection is an emitter too. */
  private readonly connection = Object.assign(new EventEmitter(), {
    query: (sql: string, params?: unknown[] | TCb<unknown>, cb?: TCb<unknown>) => this.query(sql, params, cb),
  });

  query(sql: string, params?: unknown[] | TCb<unknown>, cb?: TCb<unknown>): Promise<unknown> {
    const callback = typeof params === 'function' ? params : cb;
    const values = typeof params === 'function' ? null : params;
    const run = async () => {
      const db = await this.db();
      if (values && values.length > 0) return db.query(sql, values);
      const results = await db.exec(sql);
      return results.at(-1) ?? { rows: [] };
    };
    return run().then(
      (r) => {
        callback?.(null, r);
        return r;
      },
      (error: Error) => {
        if (callback) callback(error);
        else throw error;
      },
    );
  }

  end(cb: TCb<void>): void {
    const inst = this.state.instance;
    this.state.instance = null;
    (inst ? inst.then((db) => db.close()) : Promise.resolve()).then(
      () => cb(null),
      (error: Error) => cb(error),
    );
  }
}

/** OID 1114, `timestamp without time zone`. PGlite serializes a `Date` as `toISOString()` (a UTC wall time, the zone
 * dropped by the column) but parses the naive text back with `new Date('YYYY-MM-DD HH:MM:SS')`, i.e. as *local* time, so
 * every round trip shifts by the host's UTC offset. Reading naive timestamps as UTC matches the platform's own Postgres. */
const parseNaiveTimestampAsUtc = (value: string): Date => new Date(`${value.replace(' ', 'T')}Z`);

/** OID 16: TypeORM binds JS booleans, PGlite's default serializer sends them as `'t'`/`'f'` text. */
const serializeBoolean = (value: unknown): string => {
  if (value === true || value === 'true' || value === 1) return 'TRUE';
  if (value === false || value === 'false' || value === 0) return 'FALSE';
  return String(value);
};

/** The `driver` value for TypeORM's `postgres` dialect. The PGlite engine is created lazily on the first connection. */
export const queuedPgliteDriver = (options: PGliteOptions): { Pool: IQueuedPglitePoolClass } => {
  const state = {
    options: {
      ...options,
      parsers: { 1114: parseNaiveTimestampAsUtc, ...options.parsers },
      serializers: { 16: serializeBoolean, ...options.serializers },
    } as PGliteOptions,
    instance: null as Promise<PGlite> | null,
  };
  class BoundPool extends QueuedPGlitePool {
    constructor() {
      super(state);
    }
  }
  return { Pool: BoundPool };
};

export interface IPgliteDatabaseOptionsParams {
  /** Directory the database persists to; omit for an in-memory database. */
  readonly dataDir?: string;
  /** Extra PGlite extensions; `uuid_ossp` is always included. */
  readonly extensions?: PGliteOptions['extensions'];
}

/**
 * The `{ type: 'postgres', driver }` fragment for `createApp({ database })` / `TypeOrmModule.forRoot`. The caller adds
 * `entities`/migrations. A fresh database needs `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` before the real
 * migrations: pass `UuidOsspExtensionMigration` as an extra migration.
 */
export const createPgliteDatabaseOptions = (
  params: IPgliteDatabaseOptionsParams = {},
): { type: 'postgres'; driver: unknown } => ({
  type: 'postgres',
  driver: queuedPgliteDriver({
    ...(params.dataDir ? { dataDir: params.dataDir } : {}),
    extensions: { ...params.extensions, uuid_ossp },
  }),
});

/** Runs before every real migration (timestamp 1000000000000): the migrations assume `uuid-ossp` exists. */
export class UuidOsspExtensionMigration implements MigrationInterface {
  name = 'UuidOsspExtensionMigration1000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}

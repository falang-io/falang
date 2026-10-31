/* Spike (2026-10-31): a TypeORM `postgres`-dialect driver over one PGlite instance with real connection checkout.
 * `typeorm-pglite`'s pool hands every caller the same session at once, so two concurrent TypeORM transactions
 * interleave their BEGIN/COMMIT/ROLLBACK (demonstrated in pglite-migrations-probe.test.ts). Here `connect` hands out
 * the single session to one holder at a time and queues the rest; TypeORM releases it after each query/transaction. */
// oxlint-disable unicorn/prefer-event-target -- TypeORM's postgres driver expects node-postgres-shaped `Pool`/`Client` emitters.
import { EventEmitter } from 'node:events';
import { PGlite, type PGliteOptions } from '@electric-sql/pglite';

type TCb<T> = (err: Error | null, result?: T) => void;

export class QueuedPGlitePool extends EventEmitter {
  private static options: PGliteOptions | undefined;
  private static instance: Promise<PGlite> | null = null;
  private busy = false;
  private readonly waiters: (() => void)[] = [];

  static configure(options: PGliteOptions): void {
    QueuedPGlitePool.options = options;
  }

  private static db(): Promise<PGlite> {
    if (!QueuedPGlitePool.instance) QueuedPGlitePool.instance = PGlite.create(QueuedPGlitePool.options);
    return QueuedPGlitePool.instance;
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
      QueuedPGlitePool.db().then(
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
      const db = await QueuedPGlitePool.db();
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
    const inst = QueuedPGlitePool.instance;
    QueuedPGlitePool.instance = null;
    (inst ? inst.then((db) => db.close()) : Promise.resolve()).then(
      () => cb(null),
      (error: Error) => cb(error),
    );
  }
}

/** OID 1114, `timestamp without time zone`. PGlite serializes a `Date` as `toISOString()` (a UTC wall time, the zone
 * dropped by the column) but parses the naive text back with `new Date('YYYY-MM-DD HH:MM:SS')`, i.e. as *local* time, so
 * every round trip shifts by the host's UTC offset. `pg` is self-consistent the other way round (local both ways); the
 * platform's own Postgres runs in UTC, so reading naive timestamps as UTC matches the production data as well. */
const parseNaiveTimestampAsUtc = (value: string): Date => new Date(`${value.replace(' ', 'T')}Z`);

/** OID 16: TypeORM binds JS booleans, PGlite's default serializer sends them as `'t'`/`'f'` text, which a
 * `boolean` parameter rejects (`typeorm-pglite` applies the same mapping). */
const serializeBoolean = (value: unknown): string => {
  if (value === true || value === 'true' || value === 1) return 'TRUE';
  if (value === false || value === 'false' || value === 0) return 'FALSE';
  return String(value);
};

export const queuedPgliteDriver = (options: PGliteOptions): unknown => {
  QueuedPGlitePool.configure({
    ...options,
    parsers: { 1114: parseNaiveTimestampAsUtc, ...options.parsers },
    serializers: { 16: serializeBoolean, ...options.serializers },
  });
  return { Pool: QueuedPGlitePool };
};

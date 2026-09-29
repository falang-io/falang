import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** See ADR 0030 (private) — `'admin'` unlocks `/admin/*` (`AdminGuard`). */
export type TUserRole = 'user' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection): this app runs via `tsx`
  // (esbuild), which does not emit the `design:type` property metadata TypeORM would otherwise
  // use to infer a column's type — confirmed by actually running the app (fails at startup with
  // `ColumnTypeUndefinedError` otherwise).
  @Column({ type: 'varchar', unique: true })
  username!: string;

  @Column({ type: 'varchar' })
  password!: string;

  @Column({ type: 'varchar', default: 'en' })
  language!: string;

  @Column({ type: 'varchar', default: 'user' })
  role!: TUserRole;

  /** When a self-service signup accepted the terms at `TERMS_URL`; `null` otherwise. */
  @Column({ name: 'terms_accepted_at', type: Date, nullable: true })
  termsAcceptedAt!: Date | null;

  // `Date` (a JS constructor, not a driver-specific type string like 'timestamp') is TypeORM's
  // documented portable option for a date column when column types aren't inferred via
  // reflection — it lets each driver (Postgres, and the sqlite driver the test suite swaps in)
  // pick its own appropriate underlying SQL type.
  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

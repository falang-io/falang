import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0029 (private)'s "Document locks" decision — "one source of
 * editing at a time." `lock_expires_at` is a TTL (5 minutes by default, `DEFAULT_LOCK_TTL_MS` on the
 * MCP-host side — not phase C's own concern), renewed by every tool call touching the document by
 * the same owner; an expired lock is treated as absent everywhere, no sweeper needed. Uses plain
 * `TIMESTAMP`, matching every other timestamp column in this schema (`InitialSchema`'s `created_at`),
 * rather than `TIMESTAMPTZ` — this app stores/compares everything in UTC already.
 */
export class DocumentLocks1789555100000 implements MigrationInterface {
  name = 'DocumentLocks1789555100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" ADD "lock_owner" character varying`);
    await queryRunner.query(`ALTER TABLE "documents" ADD "lock_expires_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "lock_expires_at"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "lock_owner"`);
  }
}

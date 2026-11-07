import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0075 (private): the record's version and creation time on `table_record_changes`, so a trigger event carries the
 * real version without stuffing system keys into `before`/`after` (those are record data used by history/restore).
 * Nullable: rows written before this migration keep the dispatcher's fallback.
 */
export class TableChangeRecordVersion1790200000000 implements MigrationInterface {
  name = 'TableChangeRecordVersion1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_record_changes" ADD "record_version" integer`);
    await queryRunner.query(`ALTER TABLE "table_record_changes" ADD "record_created_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "table_record_changes" DROP COLUMN "record_created_at"`);
    await queryRunner.query(`ALTER TABLE "table_record_changes" DROP COLUMN "record_version"`);
  }
}

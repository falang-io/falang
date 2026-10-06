import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `run_journal_entries` (ADR 0059 (private) §3) — an append-only per-run log, no foreign keys (like `agent_usage`),
 * idempotent on `(workflow_id, source_key)` — plus `projects.journal_store_texts`, the per-project "don't store texts" switch.
 */
export class RunJournal1790070000000 implements MigrationInterface {
  name = 'RunJournal1790070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "run_journal_entries" ("id" bigserial NOT NULL, "project_id" uuid NOT NULL, "env" character varying NOT NULL, "build_id" character varying, "workflow_id" character varying NOT NULL, "run_id" character varying, "document_id" character varying, "node_id" character varying, "vendor" character varying, "kind" character varying NOT NULL, "level" character varying NOT NULL, "message" text NOT NULL, "data" jsonb, "truncated" boolean NOT NULL DEFAULT false, "texts_stripped" boolean NOT NULL DEFAULT false, "ts" TIMESTAMP NOT NULL, "source_key" character varying NOT NULL, CONSTRAINT "PK_run_journal_entries_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_run_journal_workflow_source" UNIQUE ("workflow_id", "source_key"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_run_journal_run" ON "run_journal_entries" ("project_id", "workflow_id", "run_id", "ts")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_run_journal_env_ts" ON "run_journal_entries" ("project_id", "env", "ts")`,
    );
    // The retention sweep deletes by env and age across every project.
    await queryRunner.query(`CREATE INDEX "IDX_run_journal_gc" ON "run_journal_entries" ("env", "ts")`);
    await queryRunner.query(`ALTER TABLE "projects" ADD "journal_store_texts" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "journal_store_texts"`);
    await queryRunner.query(`DROP INDEX "IDX_run_journal_gc"`);
    await queryRunner.query(`DROP INDEX "IDX_run_journal_env_ts"`);
    await queryRunner.query(`DROP INDEX "IDX_run_journal_run"`);
    await queryRunner.query(`DROP TABLE "run_journal_entries"`);
  }
}

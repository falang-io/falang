import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0075 (private): project tables — four per-user limit overrides, the generic `table_records` relation and the
 * append-only `table_record_changes` log. `table_id` references the `table` document (FK cascade: deleting the
 * document, or the project, removes its records); change rows keep `record_id` without a FK so history outlives a record.
 */
export class ProjectTables1790180000000 implements MigrationInterface {
  name = 'ProjectTables1790180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_tables_per_project" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_table_fields" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_table_records" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_table_record_bytes" integer`);

    await queryRunner.query(
      `CREATE TABLE "table_records" ("id" uuid NOT NULL, "project_id" uuid NOT NULL, "table_id" uuid NOT NULL, "env" character varying NOT NULL, "data" jsonb NOT NULL, "version" integer NOT NULL DEFAULT 1, "idempotency_key" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_table_records_id" PRIMARY KEY ("id"), CONSTRAINT "FK_table_records_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE, CONSTRAINT "FK_table_records_table" FOREIGN KEY ("table_id") REFERENCES "documents"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_table_records_list" ON "table_records" ("table_id", "env", "created_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_table_records_data" ON "table_records" USING gin ("data" jsonb_path_ops)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_table_records_idem" ON "table_records" ("table_id", "env", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "table_record_changes" ("id" SERIAL NOT NULL, "project_id" uuid NOT NULL, "table_id" uuid NOT NULL, "env" character varying NOT NULL, "record_id" uuid NOT NULL, "op" character varying NOT NULL, "before" jsonb, "after" jsonb, "changed_fields" jsonb, "source" character varying NOT NULL, "run_id" character varying, "workflow_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "dispatched_at" TIMESTAMP, "dispatch_status" character varying, CONSTRAINT "PK_table_record_changes_id" PRIMARY KEY ("id"), CONSTRAINT "FK_table_record_changes_table" FOREIGN KEY ("table_id") REFERENCES "documents"("id") ON DELETE CASCADE, CONSTRAINT "FK_table_record_changes_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_table_record_changes_pending" ON "table_record_changes" ("id") WHERE "dispatched_at" IS NULL AND "source" IN ('workflow', 'agent', 'mcp')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_table_record_changes_history" ON "table_record_changes" ("table_id", "env", "record_id", "id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_table_record_changes_created" ON "table_record_changes" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "table_record_changes"`);
    await queryRunner.query(`DROP TABLE "table_records"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_table_record_bytes"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_table_records"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_table_fields"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_tables_per_project"`);
  }
}

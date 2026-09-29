import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `tasks` — the durable record of a `human-task` node's ask (`Task` entity) — see
 * ADR 0040 (private) §2 and the fixed phase-4 contract. Unique on
 * `(workflow_id, run_id, node_id)` so a retried ask activity upserts (`TasksService.createOrGet`)
 * rather than duplicating. `payload`/`attachments`/`answer_data` are `jsonb` (confirmed
 * sqlite-harness-compatible the same way `IntegrationVendorData`'s own `jsonb` columns are, see that
 * entity's doc comment) since they're display-only/passthrough data, never queried by field.
 */
export class HumanTasks1789950000000 implements MigrationInterface {
  name = 'HumanTasks1789950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "env" character varying NOT NULL, "workflow_id" character varying NOT NULL, "run_id" character varying NOT NULL, "task_queue" character varying NOT NULL, "node_id" character varying NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, "payload" jsonb, "attachments" jsonb, "options" jsonb NOT NULL, "status" character varying NOT NULL, "answer" character varying, "answer_data" jsonb, "resolved_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "due_at" TIMESTAMP, "resolved_at" TIMESTAMP, "orphan_reason" text, CONSTRAINT "UQ_tasks_workflow_run_node" UNIQUE ("workflow_id", "run_id", "node_id"), CONSTRAINT "PK_tasks_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_tasks_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_tasks_project_id"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
  }
}

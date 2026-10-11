import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0067 (private): `runner_sessions` (one row per stretch of a runner Deployment being up — no foreign keys, history
 * outlives a project), the per-project runtime settings and suspension reason on `projects`, and the two new
 * `user_limits` columns (`max_idle_minutes`, `always_on_allowed`) — nullable like every other override.
 */
export class InstanceRuntime1790090000000 implements MigrationInterface {
  name = 'InstanceRuntime1790090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "runner_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "env" character varying NOT NULL, "build_id" character varying, "deployment_name" character varying NOT NULL, "task_queue" character varying NOT NULL, "started_at" TIMESTAMP NOT NULL, "last_seen_at" TIMESTAMP NOT NULL, "ended_at" TIMESTAMP, "end_reason" character varying, CONSTRAINT "PK_runner_sessions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_sessions_project_started" ON "runner_sessions" ("project_id", "started_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_runner_sessions_open" ON "runner_sessions" ("deployment_name") WHERE "ended_at" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "projects" ADD "idle_minutes_dev" integer`);
    await queryRunner.query(`ALTER TABLE "projects" ADD "idle_minutes_prod" integer`);
    await queryRunner.query(`ALTER TABLE "projects" ADD "always_on_dev" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "projects" ADD "always_on_prod" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "projects" ADD "suspended_reason" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_idle_minutes" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "always_on_allowed" boolean`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "always_on_allowed"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_idle_minutes"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "suspended_reason"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "always_on_prod"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "always_on_dev"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "idle_minutes_prod"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "idle_minutes_dev"`);
    await queryRunner.query(`DROP INDEX "IDX_runner_sessions_open"`);
    await queryRunner.query(`DROP INDEX "IDX_runner_sessions_project_started"`);
    await queryRunner.query(`DROP TABLE "runner_sessions"`);
  }
}

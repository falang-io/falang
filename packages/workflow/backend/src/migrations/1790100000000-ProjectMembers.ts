import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0070 (private): `project_members` (editor / executor roles, one row per role) and `tasks.assignee_id`, backfilled
 * with each task's project owner (the implicit assignee before members existed).
 */
export class ProjectMembers1790100000000 implements MigrationInterface {
  name = 'ProjectMembers1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "project_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" character varying(16) NOT NULL, "added_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_project_members_project_user_role" UNIQUE ("project_id", "user_id", "role"), CONSTRAINT "PK_project_members_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_project_members_user" ON "project_members" ("user_id")`);
    await queryRunner.query(
      `ALTER TABLE "project_members" ADD CONSTRAINT "FK_project_members_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_members" ADD CONSTRAINT "FK_project_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" ADD "assignee_id" uuid`);
    await queryRunner.query(
      `UPDATE "tasks" SET "assignee_id" = "projects"."owner_id" FROM "projects" WHERE "projects"."id" = "tasks"."project_id"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_project_assignee_status" ON "tasks" ("project_id", "assignee_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_tasks_project_assignee_status"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "assignee_id"`);
    await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_project_members_user"`);
    await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_project_members_project"`);
    await queryRunner.query(`DROP INDEX "IDX_project_members_user"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
  }
}

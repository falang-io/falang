import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `project_templates` — admin-managed starting points for "New project" (Stage 0, P4). `payload` is
 * an `IProjectExportPayload` stored as text (`simple-json`, same as `documents.root`/`data`).
 */
export class ProjectTemplates1789990000000 implements MigrationInterface {
  name = 'ProjectTemplates1789990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "project_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text NOT NULL DEFAULT '', "sort_order" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "payload" text NOT NULL, "source_project_id" uuid, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_project_templates_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_templates"`);
  }
}

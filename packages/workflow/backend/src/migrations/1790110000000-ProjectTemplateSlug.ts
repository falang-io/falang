import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `project_templates.slug` — a stable, human-readable key for templates maintained outside the admin UI
 * (uploaded by a script with `PUT /admin/project-templates/by-slug/:slug`) and linked from the public site
 * (`#/templates/<slug>`). Nullable: templates made in the admin UI have none.
 */
export class ProjectTemplateSlug1790110000000 implements MigrationInterface {
  name = 'ProjectTemplateSlug1790110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_templates" ADD "slug" character varying(100)`);
    await queryRunner.query(
      `ALTER TABLE "project_templates" ADD CONSTRAINT "UQ_project_templates_slug" UNIQUE ("slug")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_templates" DROP CONSTRAINT "UQ_project_templates_slug"`);
    await queryRunner.query(`ALTER TABLE "project_templates" DROP COLUMN "slug"`);
  }
}

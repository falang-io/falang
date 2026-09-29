import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0016 (private)'s Phase 2: `project_versions` used to
 * store filesystem paths to a compiled artifact (`workflows_path`/`activities_path`) because the
 * runner ran as a local child process that could just read them off disk. Runner pods can't do
 * that (no shared filesystem with `backend`, and `readOnlyRootFilesystem: true` besides) — they
 * fetch the artifact's *content* over HTTP and load it in memory instead, so it has to live in the
 * row itself now.
 */
export class ProjectVersionArtifactInMemory1789468361840 implements MigrationInterface {
  name = 'ProjectVersionArtifactInMemory1789468361840';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_versions" ADD "workflow_bundle" text`);
    await queryRunner.query(`ALTER TABLE "project_versions" ADD "activities_source" text`);
    await queryRunner.query(`UPDATE "project_versions" SET "workflow_bundle" = '', "activities_source" = ''`);
    await queryRunner.query(`ALTER TABLE "project_versions" ALTER COLUMN "workflow_bundle" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "project_versions" ALTER COLUMN "activities_source" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "project_versions" DROP COLUMN "workflows_path"`);
    await queryRunner.query(`ALTER TABLE "project_versions" DROP COLUMN "activities_path"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_versions" ADD "workflows_path" character varying`);
    await queryRunner.query(`ALTER TABLE "project_versions" ADD "activities_path" character varying`);
    await queryRunner.query(`UPDATE "project_versions" SET "workflows_path" = '', "activities_path" = ''`);
    await queryRunner.query(`ALTER TABLE "project_versions" ALTER COLUMN "workflows_path" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "project_versions" ALTER COLUMN "activities_path" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "project_versions" DROP COLUMN "workflow_bundle"`);
    await queryRunner.query(`ALTER TABLE "project_versions" DROP COLUMN "activities_source"`);
  }
}

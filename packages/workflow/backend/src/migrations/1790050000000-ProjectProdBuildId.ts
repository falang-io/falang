import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists which published version production runs (`projects.prod_build_id`) — before this only
 * Temporal knew, so `startProd` and the scale-to-zero wake always brought up the *latest* version and
 * silently undid a rollback. Backfilled with each project's latest version, which is exactly what the
 * old code would have started.
 */
export class ProjectProdBuildId1790050000000 implements MigrationInterface {
  name = 'ProjectProdBuildId1790050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" ADD "prod_build_id" character varying`);
    await queryRunner.query(
      `UPDATE "projects" p SET "prod_build_id" = (
        SELECT v."build_id" FROM "project_versions" v WHERE v."project_id" = p."id" ORDER BY v."version_number" DESC LIMIT 1
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "prod_build_id"`);
  }
}

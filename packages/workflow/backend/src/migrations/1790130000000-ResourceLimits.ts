import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Security audit P1-3: new per-user limits (all nullable overrides, like the rest of `user_limits`) and a unique
 * `(project_id, version)` index so publish can allocate version numbers safely. Pre-existing duplicate version numbers
 * (the old `count + 1` race) are renumbered first, so the migration cannot fail on real data.
 */
export class ResourceLimits1790130000000 implements MigrationInterface {
  name = 'ResourceLimits1790130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_projects" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_dev_pods" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_stored_versions" integer`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_owner_files_bytes" bigint`);
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_schedules" integer`);
    // Duplicates keep their oldest row's number; each later duplicate gets a fresh number above the project's maximum.
    await queryRunner.query(
      `WITH extra AS (SELECT "id", "project_id", ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "created_at", "id") AS rn FROM (SELECT "id", "project_id", "created_at", ROW_NUMBER() OVER (PARTITION BY "project_id", "version_number" ORDER BY "created_at", "id") AS dup FROM "project_versions") x WHERE x.dup > 1), mx AS (SELECT "project_id", MAX("version_number") AS m FROM "project_versions" GROUP BY "project_id") UPDATE "project_versions" pv SET "version_number" = mx.m + extra.rn, "build_id" = 'v' || (mx.m + extra.rn) FROM extra JOIN mx ON mx."project_id" = extra."project_id" WHERE pv."id" = extra."id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_project_versions_project_version" ON "project_versions" ("project_id", "version_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_project_versions_project_version"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_schedules"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_owner_files_bytes"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_stored_versions"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_dev_pods"`);
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_projects"`);
  }
}

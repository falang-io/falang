import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a per-user override of `MAX_CONCURRENT_PROD_VERSIONS` (`UserLimitsService`) — nullable like
 * every other `user_limits` column: absent means "use the env default".
 */
export class UserLimitsMaxProdVersions1789970000000 implements MigrationInterface {
  name = 'UserLimitsMaxProdVersions1789970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" ADD "max_concurrent_prod_versions" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" DROP COLUMN "max_concurrent_prod_versions"`);
  }
}

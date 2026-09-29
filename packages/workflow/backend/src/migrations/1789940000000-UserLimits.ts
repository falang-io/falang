import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0038 (private) §2 ("Limits are per user, not one
 * global constant") — per-user overrides of the env-level file/quota defaults
 * (`UserLimitsService`). Every column but `user_id` is nullable: an absent value falls back to
 * the env default, not zero. One row per user with at least one override.
 */
export class UserLimits1789940000000 implements MigrationInterface {
  name = 'UserLimits1789940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_limits" ("user_id" uuid NOT NULL, "max_project_files_bytes" bigint, "max_file_bytes" bigint, "dev_file_ttl_hours" integer, "ingress_file_ttl_hours" integer, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_user_limits_user_id" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_limits" ADD CONSTRAINT "FK_user_limits_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_limits" DROP CONSTRAINT "FK_user_limits_user_id"`);
    await queryRunner.query(`DROP TABLE "user_limits"`);
  }
}

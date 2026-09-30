import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Closed-beta application signup: e-mail identity + application data on `users`. Status is derived, not
 * stored (`pending_email` -> `pending_activation` -> `active`). Every pre-existing row is `active`
 * (`activated_at = created_at`) and `signup_source = 'admin'`.
 */
export class UsersEmailAndApplication1790000000000 implements MigrationInterface {
  name = 'UsersEmailAndApplication1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "email" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")`);
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "users" ADD "activated_at" TIMESTAMP`);
    await queryRunner.query(`UPDATE "users" SET "activated_at" = "created_at"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "company_name" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "automation_interest" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD "signup_source" character varying NOT NULL DEFAULT 'admin'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signup_source"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "automation_interest"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "company_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "activated_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
  }
}

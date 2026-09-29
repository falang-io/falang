import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Community/cloud auth model: `users.terms_accepted_at` records when a self-service signup accepted
 * the terms at `TERMS_URL` (null for admin-created users, the seeded admin, and signups made while
 * no `TERMS_URL` was configured).
 */
export class UserTermsAcceptedAt1789960000000 implements MigrationInterface {
  name = 'UserTermsAcceptedAt1789960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "terms_accepted_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_accepted_at"`);
  }
}

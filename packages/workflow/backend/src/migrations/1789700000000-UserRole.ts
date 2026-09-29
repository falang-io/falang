import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0030 (private) — `users.role`
 * (`'user' | 'admin'`, default `'user'`) gates the new `/admin/*` routes (`AdminGuard`).
 */
export class UserRole1789700000000 implements MigrationInterface {
  name = 'UserRole1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'user'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}

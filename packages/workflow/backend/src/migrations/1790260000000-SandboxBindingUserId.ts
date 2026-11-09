import type { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0073 (private): the user of a bound private chat, so a MAX test bot can relay sends by `user_id`. */
export class SandboxBindingUserId1790260000000 implements MigrationInterface {
  name = 'SandboxBindingUserId1790260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sandbox_bot_bindings" ADD "user_id" character varying`);
    await queryRunner.query(
      `CREATE INDEX "IDX_sandbox_bot_bindings_user" ON "sandbox_bot_bindings" ("vendor", "project_id", "user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sandbox_bot_bindings_user"`);
    await queryRunner.query(`ALTER TABLE "sandbox_bot_bindings" DROP COLUMN "user_id"`);
  }
}

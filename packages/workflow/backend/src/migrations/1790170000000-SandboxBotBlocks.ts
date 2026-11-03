import { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0073 (private): `sandbox_bot_blocks` — accounts the test bot of a messenger is blocked for (abuse protection). */
export class SandboxBotBlocks1790170000000 implements MigrationInterface {
  name = 'SandboxBotBlocks1790170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sandbox_bot_blocks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor" character varying NOT NULL, "user_id" uuid NOT NULL, "reason" character varying NOT NULL, "project_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_sandbox_bot_blocks_user" UNIQUE ("vendor", "user_id"), CONSTRAINT "PK_sandbox_bot_blocks_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sandbox_bot_blocks"`);
  }
}

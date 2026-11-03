import { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0073 (private): `sandbox_bot_messages` — messages created through a test bot, for id-only edit calls (MAX). */
export class SandboxBotMessages1790160000000 implements MigrationInterface {
  name = 'SandboxBotMessages1790160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sandbox_bot_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor" character varying NOT NULL, "message_id" character varying NOT NULL, "project_id" uuid NOT NULL, "chat_id" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_sandbox_bot_messages_message" UNIQUE ("vendor", "message_id"), CONSTRAINT "PK_sandbox_bot_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sandbox_bot_messages_chat" ON "sandbox_bot_messages" ("vendor", "chat_id", "project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sandbox_bot_messages_chat"`);
    await queryRunner.query(`DROP TABLE "sandbox_bot_messages"`);
  }
}

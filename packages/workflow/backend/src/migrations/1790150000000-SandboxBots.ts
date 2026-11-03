import { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0073 (private): `sandbox_bot_bindings` (chat <-> project credential) and `sandbox_bot_link_codes` (one-time, hashed). */
export class SandboxBots1790150000000 implements MigrationInterface {
  name = 'SandboxBots1790150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sandbox_bot_bindings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor" character varying NOT NULL, "chat_id" character varying NOT NULL, "project_id" uuid NOT NULL, "credential_id" character varying NOT NULL, "chat_title" character varying, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "last_activity_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_sandbox_bot_bindings_chat" UNIQUE ("vendor", "chat_id"), CONSTRAINT "PK_sandbox_bot_bindings_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sandbox_bot_bindings_credential" ON "sandbox_bot_bindings" ("project_id", "credential_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "sandbox_bot_link_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code_hash" character varying NOT NULL, "vendor" character varying NOT NULL, "project_id" uuid NOT NULL, "credential_id" character varying NOT NULL, "created_by" uuid, "expires_at" TIMESTAMP NOT NULL, "used_at" TIMESTAMP, CONSTRAINT "PK_sandbox_bot_link_codes_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_sandbox_bot_link_codes_hash" ON "sandbox_bot_link_codes" ("code_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sandbox_bot_link_codes_hash"`);
    await queryRunner.query(`DROP TABLE "sandbox_bot_link_codes"`);
    await queryRunner.query(`DROP INDEX "IDX_sandbox_bot_bindings_credential"`);
    await queryRunner.query(`DROP TABLE "sandbox_bot_bindings"`);
  }
}

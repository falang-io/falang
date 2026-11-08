import { MigrationInterface, QueryRunner } from 'typeorm';

/** ADR 0079 (private): `message_waits` — runs waiting for the next message in a messenger chat. */
export class MessageWaits1790250000000 implements MigrationInterface {
  name = 'MessageWaits1790250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "message_waits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "env" character varying NOT NULL, "vendor" character varying NOT NULL, "credential_id" character varying NOT NULL, "chat_id" character varying NOT NULL, "user_id" character varying NOT NULL DEFAULT '', "workflow_id" character varying NOT NULL, "run_id" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_message_waits_key" UNIQUE ("project_id", "env", "vendor", "credential_id", "chat_id", "user_id"), CONSTRAINT "PK_message_waits_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_message_waits_expires" ON "message_waits" ("expires_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_message_waits_expires"`);
    await queryRunner.query(`DROP TABLE "message_waits"`);
  }
}

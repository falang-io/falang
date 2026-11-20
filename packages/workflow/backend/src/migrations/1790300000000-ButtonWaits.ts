import { MigrationInterface, QueryRunner } from 'typeorm';

export class ButtonWaits1790300000000 implements MigrationInterface {
  name = 'ButtonWaits1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "button_waits" ("id" character varying NOT NULL, "project_id" uuid NOT NULL, "env" character varying NOT NULL, "vendor" character varying NOT NULL, "credential_id" character varying NOT NULL, "chat_id" character varying NOT NULL, "message_id" character varying NOT NULL, "workflow_id" character varying NOT NULL, "run_id" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_button_waits_message" UNIQUE ("project_id", "env", "vendor", "credential_id", "chat_id", "message_id"), CONSTRAINT "PK_button_waits_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_button_waits_expires" ON "button_waits" ("expires_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_button_waits_expires"`);
    await queryRunner.query(`DROP TABLE "button_waits"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/** `support_messages` — the user ↔ administrator support chat; one thread per user (`user_id`). */
export class SupportMessages1790020000000 implements MigrationInterface {
  name = 'SupportMessages1790020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "support_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "author_role" character varying NOT NULL, "author_id" uuid NOT NULL, "text" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "read_at" TIMESTAMP, CONSTRAINT "PK_support_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_messages_user_created" ON "support_messages" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_support_messages_user_created"`);
    await queryRunner.query(`DROP TABLE "support_messages"`);
  }
}

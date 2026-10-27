import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Security audit P1-5 / P1-13: `users.token_version` (JWT revocation), `users.admin_notified_at` (admin digest mails;
 * existing rows are backfilled as already announced) and `auth_mail_events` (per-address / per-IP mail limits).
 */
export class AuthHardening1790110000000 implements MigrationInterface {
  name = 'AuthHardening1790110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "token_version" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "users" ADD "admin_notified_at" TIMESTAMP`);
    await queryRunner.query(`UPDATE "users" SET "admin_notified_at" = now()`);
    await queryRunner.query(
      `CREATE TABLE "auth_mail_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" character varying NOT NULL, "address_hash" character varying NOT NULL, "ip" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_auth_mail_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_mail_events_address" ON "auth_mail_events" ("address_hash", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_auth_mail_events_ip" ON "auth_mail_events" ("ip", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_auth_mail_events_ip"`);
    await queryRunner.query(`DROP INDEX "IDX_auth_mail_events_address"`);
    await queryRunner.query(`DROP TABLE "auth_mail_events"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "admin_notified_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version"`);
  }
}

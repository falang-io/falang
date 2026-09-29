import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0031 (private) — a generic deployment-wide
 * key/value table (`AppSettingsService`), first used by `AgentSettingsService`'s `agent.*` keys.
 */
export class AppSettings1789800000000 implements MigrationInterface {
  name = 'AppSettings1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("key" character varying NOT NULL, "value" text NOT NULL, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_app_settings_key" PRIMARY KEY ("key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}

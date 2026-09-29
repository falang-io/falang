import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0030 (private) — one row per vendor,
 * a platform-owned OAuth2 client for ActivePieces OAuth2 pieces (`OAuthCredentialsService`).
 */
export class OAuthCredentials1789700100000 implements MigrationInterface {
  name = 'OAuthCredentials1789700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth_credentials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "vendor" character varying NOT NULL, "client_id" character varying NOT NULL, "client_secret_encrypted" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_oauth_credentials_vendor" UNIQUE ("vendor"), CONSTRAINT "PK_oauth_credentials_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "oauth_credentials"`);
  }
}

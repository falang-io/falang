import { MigrationInterface, QueryRunner } from 'typeorm';

/** `auth_tokens` — single-use e-mail verification / password reset tokens; only the sha256 hash is stored. */
export class AuthTokens1790010000000 implements MigrationInterface {
  name = 'AuthTokens1790010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "auth_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "kind" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "used_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_auth_tokens_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_auth_tokens_hash" ON "auth_tokens" ("token_hash")`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_tokens_user_kind" ON "auth_tokens" ("user_id", "kind")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_auth_tokens_user_kind"`);
    await queryRunner.query(`DROP INDEX "IDX_auth_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
  }
}

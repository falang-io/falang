import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0029 (private)'s phase C: personal access tokens for the
 * future `/mcp` endpoint (phase F). Only `token_hash` (sha-256 of the raw `flg_pat_…` secret) is
 * ever persisted — the raw token itself is returned to the caller exactly once, at creation time,
 * and never stored.
 */
export class PersonalAccessTokens1789555000000 implements MigrationInterface {
  name = 'PersonalAccessTokens1789555000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "personal_access_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "name" character varying NOT NULL, "token_hash" character varying NOT NULL, "project_id" uuid, "expires_at" TIMESTAMP, "last_used_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP, CONSTRAINT "UQ_personal_access_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "PK_personal_access_tokens_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "FK_personal_access_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "FK_personal_access_tokens_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "personal_access_tokens" DROP CONSTRAINT "FK_personal_access_tokens_project_id"`,
    );
    await queryRunner.query(`ALTER TABLE "personal_access_tokens" DROP CONSTRAINT "FK_personal_access_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "personal_access_tokens"`);
  }
}

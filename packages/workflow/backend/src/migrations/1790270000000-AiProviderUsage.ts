import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0081 (private): `ai_provider_usage` — one row per upstream call of the built-in AI provider
 * (`DbAiProviderUsageSink`). Token columns are nullable (an upstream may send no `usage`); no foreign keys.
 */
export class AiProviderUsage1790270000000 implements MigrationInterface {
  name = 'AiProviderUsage1790270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_provider_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "env" character varying NOT NULL, "model" character varying NOT NULL, "kind" character varying NOT NULL, "prompt_tokens" integer, "completion_tokens" integer, "cached_prompt_tokens" integer, "total_tokens" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ai_provider_usage_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_provider_usage_project_created" ON "ai_provider_usage" ("project_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ai_provider_usage_project_created"`);
    await queryRunner.query(`DROP TABLE "ai_provider_usage"`);
  }
}

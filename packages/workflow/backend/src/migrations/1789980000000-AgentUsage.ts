import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `agent_usage` — one row per in-app agent vendor call (`DbAgentUsageSink`). `prompt_tokens`/
 * `completion_tokens`/`total_tokens` are nullable: some OpenAI-compatible vendors send no `usage`.
 */
export class AgentUsage1789980000000 implements MigrationInterface {
  name = 'AgentUsage1789980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "agent_usage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "project_id" uuid NOT NULL, "model" character varying NOT NULL, "prompt_tokens" integer, "completion_tokens" integer, "total_tokens" integer, "duration_ms" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_agent_usage_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_usage_project_created" ON "agent_usage" ("project_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_agent_usage_project_created"`);
    await queryRunner.query(`DROP TABLE "agent_usage"`);
  }
}

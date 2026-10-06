import { MigrationInterface, QueryRunner } from 'typeorm';

/** `agent_usage.cached_prompt_tokens` — the part of `prompt_tokens` the vendor served from its prompt cache (nullable). */
export class AgentUsageCachedPromptTokens1790060000000 implements MigrationInterface {
  name = 'AgentUsageCachedPromptTokens1790060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_usage" ADD "cached_prompt_tokens" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agent_usage" DROP COLUMN "cached_prompt_tokens"`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0081 (private) phase 4: image generation and transcription through the built-in AI provider —
 * `ai_provider_usage.images` (images an image-generation reply carried) and `audio_seconds` (duration a `whisper-1`
 * transcription reported). Timestamped after the hosted edition's `1790280000000` (one shared migrations table).
 */
export class AiProviderUsageMedia1790290000000 implements MigrationInterface {
  name = 'AiProviderUsageMedia1790290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_provider_usage" ADD "images" integer`);
    await queryRunner.query(`ALTER TABLE "ai_provider_usage" ADD "audio_seconds" real`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_provider_usage" DROP COLUMN "audio_seconds"`);
    await queryRunner.query(`ALTER TABLE "ai_provider_usage" DROP COLUMN "images"`);
  }
}

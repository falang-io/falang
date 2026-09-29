import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0025 (private)'s "Correction to decision 2 (2026-09-18)":
 * session-gap auto-versions replace the client-driven `AutoCommitScheduler` — the receiving side of
 * every mutating project-content write now needs to remember the project's last-edit time to decide
 * whether the new edit starts a fresh "session" (see `SessionGapAutoVersionInterceptor`).
 */
export class ProjectLastEditedAt1789600000000 implements MigrationInterface {
  name = 'ProjectLastEditedAt1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" ADD "last_edited_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "last_edited_at"`);
  }
}

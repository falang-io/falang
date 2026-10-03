import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeStoredProjectLayout } from '../domains/projects/layout/project-layout.js';

/**
 * `folders.fixed_kind` (ADR 0055 (private)): the fixed root section folders of a workflow project
 * (`triggers`/`functions`/`types`), at most one per kind per project. Then every existing project is
 * normalised to the fixed layout (sections created, documents moved, mixed folders split, empty root
 * folder trees dropped). There is no production data yet (only dev/e2e databases), so the migration
 * calls the live normalisation instead of a frozen copy — revisit if that function changes before this
 * runs against real customer data.
 */
export class FixedFolders1790030000000 implements MigrationInterface {
  name = 'FixedFolders1790030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "folders" ADD "fixed_kind" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_folders_project_fixed_kind" ON "folders" ("project_id", "fixed_kind") WHERE "fixed_kind" IS NOT NULL`,
    );
    const projects: { id: string }[] = await queryRunner.query(`SELECT "id" FROM "projects"`);
    for (const project of projects) {
      // oxlint-disable-next-line no-await-in-loop -- one project at a time keeps the migration's memory flat.
      await normalizeStoredProjectLayout(queryRunner.manager, project.id);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The normalised layout is kept (sections simply become ordinary folders again).
    await queryRunner.query(`DROP INDEX "IDX_folders_project_fixed_kind"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP COLUMN "fixed_kind"`);
  }
}

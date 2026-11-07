import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR 0075 (private): adds the fourth fixed root section, `Tables`, to every existing project. Plain SQL on purpose —
 * the live layout normaliser may change later, a migration must not (see `FixedFolders1790030000000`).
 */
export class TablesSectionFolder1790190000000 implements MigrationInterface {
  name = 'TablesSectionFolder1790190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "folders" ("id", "name", "parent_id", "project_id", "fixed_kind") SELECT uuid_generate_v4(), 'Tables', NULL, p."id", 'tables' FROM "projects" p WHERE NOT EXISTS (SELECT 1 FROM "folders" f WHERE f."project_id" = p."id" AND f."fixed_kind" = 'tables')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "folders" f WHERE f."fixed_kind" = 'tables' AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."folder_id" = f."id") AND NOT EXISTS (SELECT 1 FROM "folders" c WHERE c."parent_id" = f."id")`,
    );
  }
}

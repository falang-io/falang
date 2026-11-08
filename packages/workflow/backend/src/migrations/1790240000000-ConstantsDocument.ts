import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the pinned `Constants` document (the project's dev/prod constants) to every existing project — new projects get
 * it from `ProjectsService.create`. Plain SQL on purpose, same as `TablesSectionFolder1790190000000`. Timestamp after
 * the `direct-execution` branch's migrations (1790210000000–1790230000000) so the two never collide.
 */
export class ConstantsDocument1790240000000 implements MigrationInterface {
  name = 'ConstantsDocument1790240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "documents" ("id", "type", "name", "folder_id", "project_id", "pinned", "root", "data") SELECT uuid_generate_v4(), 'constants', 'Constants', NULL, p."id", true, NULL, '{"constants":[]}' FROM "projects" p WHERE NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."project_id" = p."id" AND d."type" = 'constants')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "documents" WHERE "type" = 'constants'`);
  }
}

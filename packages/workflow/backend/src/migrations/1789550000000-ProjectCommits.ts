import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0025 (private): project-level versioning (commits + content-
 * addressed document blobs) for the workflow product's `DbVersionStore` (`VersioningService`).
 * `project_commits.tree` never embeds document content directly — it's `simple-json` of
 * `{ folders, documents: [{ ..., blobHash }] }`, resolved against `project_blobs` (composite PK
 * `(project_id, hash)`, content-addressed by `sha256` of `@falang/versioning`'s
 * `canonicalStringify`) so one changed document out of many writes exactly one new blob row.
 * `project_versions.commit_id` ties a published version back to the commit it was compiled from.
 */
export class ProjectCommits1789550000000 implements MigrationInterface {
  name = 'ProjectCommits1789550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "project_commits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "parent_id" uuid, "author_id" uuid NOT NULL, "kind" character varying NOT NULL, "message" text NOT NULL, "tree" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_project_commits_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_commits_project_id_created_at" ON "project_commits" ("project_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_commits" ADD CONSTRAINT "FK_project_commits_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_commits" ADD CONSTRAINT "FK_project_commits_parent_id" FOREIGN KEY ("parent_id") REFERENCES "project_commits"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_commits" ADD CONSTRAINT "FK_project_commits_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "project_blobs" ("project_id" uuid NOT NULL, "hash" character varying(64) NOT NULL, "content" text NOT NULL, CONSTRAINT "PK_project_blobs_project_id_hash" PRIMARY KEY ("project_id", "hash"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_blobs" ADD CONSTRAINT "FK_project_blobs_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "project_versions" ADD "commit_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "project_versions" ADD CONSTRAINT "FK_project_versions_commit_id" FOREIGN KEY ("commit_id") REFERENCES "project_commits"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_versions" DROP CONSTRAINT "FK_project_versions_commit_id"`);
    await queryRunner.query(`ALTER TABLE "project_versions" DROP COLUMN "commit_id"`);

    await queryRunner.query(`ALTER TABLE "project_blobs" DROP CONSTRAINT "FK_project_blobs_project_id"`);
    await queryRunner.query(`DROP TABLE "project_blobs"`);

    await queryRunner.query(`ALTER TABLE "project_commits" DROP CONSTRAINT "FK_project_commits_author_id"`);
    await queryRunner.query(`ALTER TABLE "project_commits" DROP CONSTRAINT "FK_project_commits_parent_id"`);
    await queryRunner.query(`ALTER TABLE "project_commits" DROP CONSTRAINT "FK_project_commits_project_id"`);
    await queryRunner.query(`DROP INDEX "IDX_project_commits_project_id_created_at"`);
    await queryRunner.query(`DROP TABLE "project_commits"`);
  }
}

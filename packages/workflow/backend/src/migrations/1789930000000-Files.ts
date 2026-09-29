import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `files` — metadata for objects in the platform's S3-compatible bucket (`storage_key`,
 * `<projectId>/<id>`) — see ADR 0038 (private) §2. The bytes
 * themselves never touch Postgres. `id` is a 22-character base64url string (`generateFileId()`),
 * not a uuid. `public_token` is nullable+unique: `null` until `files-publish` mints one,
 * `files-unpublish` clears it back to `null` without touching the row otherwise.
 */
export class Files1789930000000 implements MigrationInterface {
  name = 'Files1789930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "files" ("id" character varying(22) NOT NULL, "project_id" uuid NOT NULL, "name" character varying NOT NULL, "size" bigint NOT NULL, "mime" character varying NOT NULL, "storage_key" character varying NOT NULL, "created_by" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "expires_at" TIMESTAMP, "public_token" character varying, CONSTRAINT "UQ_files_public_token" UNIQUE ("public_token"), CONSTRAINT "PK_files_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" ADD CONSTRAINT "FK_files_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT "FK_files_project_id"`);
    await queryRunner.query(`DROP TABLE "files"`);
  }
}

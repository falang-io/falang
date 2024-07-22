import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentVisibilityColumn1669908024681 implements MigrationInterface {
    name = 'AddDocumentVisibilityColumn1669908024681'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" ADD "visibility" character varying NOT NULL DEFAULT 'private'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" DROP COLUMN "visibility"`);
    }

}

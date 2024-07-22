import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentVersionDeletedColumn1669907013728 implements MigrationInterface {
    name = 'AddDocumentVersionDeletedColumn1669907013728'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD "deleted" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP COLUMN "deleted"`);
    }

}

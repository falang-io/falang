import { MigrationInterface, QueryRunner } from "typeorm";

export class Document1682437995067 implements MigrationInterface {
    name = 'Document1682437995067'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" ADD "projectTemplate" character varying NOT NULL DEFAULT 'text'`);
        await queryRunner.query(`ALTER TABLE "Documents" ADD "schemeTemplate" character varying NOT NULL DEFAULT 'text'`);
        await queryRunner.query(`ALTER TABLE "Documents" ADD "icon" character varying NOT NULL DEFAULT 'function'`);
        await queryRunner.query(`ALTER TABLE "Documents" ALTER COLUMN "template" SET DEFAULT 'text'`);
        await queryRunner.query(`UPDATE "Documents" SET "schemeTemplate" = "template";`);      
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" ALTER COLUMN "template" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "Documents" DROP COLUMN "icon"`);
        await queryRunner.query(`ALTER TABLE "Documents" DROP COLUMN "schemeTemplate"`);
        await queryRunner.query(`ALTER TABLE "Documents" DROP COLUMN "projectTemplate"`);
    }

}

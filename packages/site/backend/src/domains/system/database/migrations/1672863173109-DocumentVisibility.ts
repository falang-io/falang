import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentVisibility1672863173109 implements MigrationInterface {
    name = 'DocumentVisibility1672863173109'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" ADD "moderatedForLibrary" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" DROP COLUMN "moderatedForLibrary"`);
    }

}

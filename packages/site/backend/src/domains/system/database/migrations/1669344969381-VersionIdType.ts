import { MigrationInterface, QueryRunner } from "typeorm";

export class VersionIdType1669344969381 implements MigrationInterface {
    name = 'VersionIdType1669344969381'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP CONSTRAINT "PK_dc9f2ad928a9624225bcd9fdeb7"`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD "id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD CONSTRAINT "PK_dc9f2ad928a9624225bcd9fdeb7" PRIMARY KEY ("id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP CONSTRAINT "PK_dc9f2ad928a9624225bcd9fdeb7"`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD CONSTRAINT "PK_dc9f2ad928a9624225bcd9fdeb7" PRIMARY KEY ("id")`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class SessionData1669020391264 implements MigrationInterface {
    name = 'SessionData1669020391264'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Sessions" ADD "data" text NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Sessions" DROP COLUMN "data"`);
    }

}

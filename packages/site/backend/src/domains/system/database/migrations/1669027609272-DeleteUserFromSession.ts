import { MigrationInterface, QueryRunner } from "typeorm";

export class DeleteUserFromSession1669027609272 implements MigrationInterface {
    name = 'DeleteUserFromSession1669027609272'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Sessions" DROP CONSTRAINT "FK_582c3cb0fcddddf078b33e316d3"`);
        await queryRunner.query(`ALTER TABLE "Sessions" DROP COLUMN "userId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Sessions" ADD "userId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "Sessions" ADD CONSTRAINT "FK_582c3cb0fcddddf078b33e316d3" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}

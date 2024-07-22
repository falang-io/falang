import { MigrationInterface, QueryRunner } from "typeorm";

export class Confirmations1669786922893 implements MigrationInterface {
    name = 'Confirmations1669786922893'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "UserConfirmCodes" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "code" character varying NOT NULL, "userId" integer NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_95180572d87b0028ebbbcd251bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ece1fc007acca682b12bfebff0" ON "UserConfirmCodes" ("type", "userId") `);
        await queryRunner.query(`ALTER TABLE "UserConfirmCodes" ADD CONSTRAINT "FK_e3e609d62ce89e216cb14ada8cb" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "UserConfirmCodes" DROP CONSTRAINT "FK_e3e609d62ce89e216cb14ada8cb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ece1fc007acca682b12bfebff0"`);
        await queryRunner.query(`DROP TABLE "UserConfirmCodes"`);
    }

}

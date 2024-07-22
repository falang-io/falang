import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1668704608003 implements MigrationInterface {
    name = 'Init1668704608003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "UsersPreregistered" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "email" character varying NOT NULL, "code" character varying NOT NULL, "promo" character varying NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished" TIMESTAMP WITH TIME ZONE, "success" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_99c93ebbaf059ab64c7f83bd7f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ff23a211e33e13c50c3a454b81" ON "UsersPreregistered" ("email") WHERE finished is null`);
        await queryRunner.query(`CREATE TABLE "Users" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "username_unique" character varying NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "passwordSalt" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "lastLogin" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_3c3ab3f49a87e6ddb607f3c4945" UNIQUE ("email"), CONSTRAINT "UQ_50f4da0b04c32b9bf28274b0858" UNIQUE ("username_unique"), CONSTRAINT "PK_16d4f7d636df336db11d87413e3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "Sessions" ("id" character varying(40) NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires" TIMESTAMP WITH TIME ZONE NOT NULL, "userId" integer NOT NULL, CONSTRAINT "PK_0ff5532d98863bc618809d2d401" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "Sessions" ADD CONSTRAINT "FK_582c3cb0fcddddf078b33e316d3" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Sessions" DROP CONSTRAINT "FK_582c3cb0fcddddf078b33e316d3"`);
        await queryRunner.query(`DROP TABLE "Sessions"`);
        await queryRunner.query(`DROP TABLE "Users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff23a211e33e13c50c3a454b81"`);
        await queryRunner.query(`DROP TABLE "UsersPreregistered"`);
    }

}

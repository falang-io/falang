import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentsAndVersionsAdded1669133100009 implements MigrationInterface {
    name = 'DocumentsAndVersionsAdded1669133100009'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "DocumentVersions" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "hash" character varying NOT NULL, "description" text NOT NULL, "versionIndex" integer NOT NULL, "documentId" character varying NOT NULL, "tags" character varying, "latest" boolean NOT NULL DEFAULT false, "data" jsonb NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dc9f2ad928a9624225bcd9fdeb7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "DocumentVersion_Latest" ON "DocumentVersions" ("latest") WHERE latest = true`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_392d3adc85f548ff6af1b890c9" ON "DocumentVersions" ("documentId", "versionIndex") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "DocumentVersion_Latest_documentId_Unique" ON "DocumentVersions" ("documentId") WHERE latest = true`);
        await queryRunner.query(`CREATE TABLE "Documents" ("id" character varying NOT NULL, "name" character varying NOT NULL, "template" character varying NOT NULL, "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted" TIMESTAMP WITH TIME ZONE, "userId" integer NOT NULL, CONSTRAINT "PK_c83f113e27e0b47ada7d9691125" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" ADD CONSTRAINT "FK_50614ceff0fda6b743d297772aa" FOREIGN KEY ("documentId") REFERENCES "Documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Documents" ADD CONSTRAINT "FK_9ac951372f1df5a12d7a21c2be6" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Documents" DROP CONSTRAINT "FK_9ac951372f1df5a12d7a21c2be6"`);
        await queryRunner.query(`ALTER TABLE "DocumentVersions" DROP CONSTRAINT "FK_50614ceff0fda6b743d297772aa"`);
        await queryRunner.query(`DROP TABLE "Documents"`);
        await queryRunner.query(`DROP INDEX "public"."DocumentVersion_Latest_documentId_Unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_392d3adc85f548ff6af1b890c9"`);
        await queryRunner.query(`DROP INDEX "public"."DocumentVersion_Latest"`);
        await queryRunner.query(`DROP TABLE "DocumentVersions"`);
    }

}

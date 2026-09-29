import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part of ADR 0039 (private) §4 ("Decisions (2026-09-28)" #2) — backend-
 * written, non-secret per-instance data (starting with the SQL vendors' synced table/column schema)
 * kept in its own table, not on `IIntegrationInstance`/the `integrations` document. Composite PK
 * `(project_id, instance_id, key)` already covers every lookup this needs (`get`/`getAll` by
 * project+instance, `remove` by project+instance+key) — no separate index required.
 */
export class IntegrationVendorData1789920000000 implements MigrationInterface {
  name = 'IntegrationVendorData1789920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "integration_vendor_data" ("project_id" uuid NOT NULL, "instance_id" character varying NOT NULL, "key" character varying NOT NULL, "vendor" character varying NOT NULL, "data" jsonb NOT NULL, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_integration_vendor_data_project_id_instance_id_key" PRIMARY KEY ("project_id", "instance_id", "key"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "integration_vendor_data" ADD CONSTRAINT "FK_integration_vendor_data_project_id" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "integration_vendor_data" DROP CONSTRAINT "FK_integration_vendor_data_project_id"`,
    );
    await queryRunner.query(`DROP TABLE "integration_vendor_data"`);
  }
}

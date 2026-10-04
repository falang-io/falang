import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persists the prod Start/Stop toggle (`projects.prod_enabled`) — before this it lived only in the
 * gateway's in-memory activation set, so every `backend` restart silently stopped prod-env vendor
 * ingress (e.g. Telegram polling) while the prod runner pod and the client's status kept saying
 * "running". Existing projects start at `false`; `BuildService`'s boot reconciliation flips it for any
 * project that still has a prod runner pod.
 */
export class ProjectProdEnabled1790040000000 implements MigrationInterface {
  name = 'ProjectProdEnabled1790040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" ADD "prod_enabled" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "prod_enabled"`);
  }
}

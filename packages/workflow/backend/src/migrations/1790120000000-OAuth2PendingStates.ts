import { MigrationInterface, QueryRunner } from 'typeorm';

/** Security audit P1-8: OAuth2 `state` kept in the database (multi-replica) and bound to the initiating browser. */
export class OAuth2PendingStates1790120000000 implements MigrationInterface {
  name = 'OAuth2PendingStates1790120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth2_pending_states" ("state_hash" character varying(64) NOT NULL, "launch_id_hash" character varying(64) NOT NULL, "nonce_hash" character varying(64), "payload" text NOT NULL, "authorize_url" text NOT NULL, "launched_at" TIMESTAMP, "expires_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_oauth2_pending_states" PRIMARY KEY ("state_hash"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_oauth2_pending_states_launch" ON "oauth2_pending_states" ("launch_id_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth2_pending_states_expires" ON "oauth2_pending_states" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_oauth2_pending_states_expires"`);
    await queryRunner.query(`DROP INDEX "IDX_oauth2_pending_states_launch"`);
    await queryRunner.query(`DROP TABLE "oauth2_pending_states"`);
  }
}

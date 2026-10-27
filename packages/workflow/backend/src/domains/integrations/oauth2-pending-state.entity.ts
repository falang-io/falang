import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One in-flight OAuth2 "Connect" attempt (security audit P1-8). Keyed by the sha256 of the `state` sent to
 * the vendor; the launch id (what the popup opens first) is stored hashed too. `nonce_hash` is set when the
 * popup passes through `/oauth2/launch/:launchId` and ties the attempt to that browser's cookie.
 * `authorize_url` is the vendor URL (it carries `state`, single-use and short-lived) the launch route redirects to.
 */
@Entity('oauth2_pending_states')
export class OAuth2PendingStateRow {
  @PrimaryColumn({ name: 'state_hash', type: 'varchar', length: 64 })
  stateHash!: string;

  @Index({ unique: true })
  @Column({ name: 'launch_id_hash', type: 'varchar', length: 64 })
  launchIdHash!: string;

  @Column({ name: 'nonce_hash', type: 'varchar', length: 64, nullable: true })
  nonceHash!: string | null;

  @Column({ type: 'text' })
  payload!: string;

  @Column({ name: 'authorize_url', type: 'text' })
  authorizeUrl!: string;

  @Column({ name: 'launched_at', type: Date, nullable: true })
  launchedAt!: Date | null;

  @Index()
  @Column({ name: 'expires_at', type: Date })
  expiresAt!: Date;
}

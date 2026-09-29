import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One row per vendor — a platform-owned OAuth2 client (client id + encrypted client secret)
 * replacing the per-credential `client_id`/`client_secret` fields ActivePieces OAuth2 pieces used
 * to require. See ADR 0030 (private).
 */
@Entity('oauth_credentials')
export class OAuthCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // `type` is explicit on every column below (not left to reflection) — see `User`'s entity for why.
  @Column({ type: 'varchar', unique: true })
  vendor!: string;

  @Column({ name: 'client_id', type: 'varchar' })
  clientId!: string;

  /** Encrypted with `CREDENTIALS_ENCRYPTION_KEY` via `credentials-crypto.ts`, same as per-credential secret fields. */
  @Column({ name: 'client_secret_encrypted', type: 'text' })
  clientSecretEncrypted!: string;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

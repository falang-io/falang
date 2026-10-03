import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TAuthTokenKind = 'verify-email' | 'reset-password';

/** Only the sha256 hash of the token is stored; the raw value exists only in the e-mailed link. */
@Entity('auth_tokens')
@Index(['userId', 'kind'])
export class AuthToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  kind!: TAuthTokenKind;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: Date })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: Date, nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

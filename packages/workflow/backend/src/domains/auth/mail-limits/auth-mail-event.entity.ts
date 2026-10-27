import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TAuthMailKind = 'verify-email' | 'reset-password' | 'account-exists';

/** One account mail that was actually sent; counted for the per-address / per-IP limits (survives restarts). */
@Entity('auth_mail_events')
@Index(['addressHash', 'createdAt'])
@Index(['ip', 'createdAt'])
export class AuthMailEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  kind!: TAuthMailKind;

  /** sha256 of the lower-cased address; the address itself is not stored. */
  @Column({ name: 'address_hash', type: 'varchar' })
  addressHash!: string;

  @Column({ type: 'varchar', nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

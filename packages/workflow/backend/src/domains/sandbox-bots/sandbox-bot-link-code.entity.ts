import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A one-time link code (ADR 0073 (private)); only the sha256 hash is stored, the raw code exists only in the link. */
@Entity('sandbox_bot_link_codes')
export class SandboxBotLinkCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'code_hash', type: 'varchar' })
  codeHash!: string;

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'credential_id', type: 'varchar' })
  credentialId!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'expires_at', type: Date })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: Date, nullable: true })
  usedAt!: Date | null;
}

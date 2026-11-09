import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One chat bound to one `(project, credential)` for a messenger (ADR 0073 (private)). A chat has at most one binding per
 * vendor; it lives `bindingTtlMinutes` since `last_activity_at`. No foreign keys, like the neighbouring tables.
 */
@Entity('sandbox_bot_bindings')
@Unique('UQ_sandbox_bot_bindings_chat', ['vendor', 'chatId'])
@Index('IDX_sandbox_bot_bindings_credential', ['projectId', 'credentialId'])
export class SandboxBotBinding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ name: 'chat_id', type: 'varchar' })
  chatId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'credential_id', type: 'varchar' })
  credentialId!: string;

  /** The private chat's user when the messenger sends by user id too (MAX) — lets the relay accept `user_id`. */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null;

  @Column({ name: 'chat_title', type: 'varchar', nullable: true })
  chatTitle!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  @Column({ name: 'last_activity_at', type: Date })
  lastActivityAt!: Date;
}

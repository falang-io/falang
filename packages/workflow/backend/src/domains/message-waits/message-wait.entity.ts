import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * A run waiting for the next message in a chat (ADR 0079 (private)) — registered by a messenger "wait for message"
 * node, claimed (deleted) by the vendor ingress when the message arrives, released by the node on timeout/cancel,
 * swept once expired. One row per (project, env, vendor, credential, chat, user): a newer wait replaces an older one.
 * `user_id` is `''` for "anyone in the chat" (a unique key can't hold `NULL`s portably). No foreign keys, like
 * `run_journal_entries`.
 */
@Entity('message_waits')
@Unique('UQ_message_waits_key', ['projectId', 'env', 'vendor', 'credentialId', 'chatId', 'userId'])
@Index('IDX_message_waits_expires', ['expiresAt'])
export class MessageWait {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  env!: 'dev' | 'prod';

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ name: 'credential_id', type: 'varchar' })
  credentialId!: string;

  @Column({ name: 'chat_id', type: 'varchar' })
  chatId!: string;

  @Column({ name: 'user_id', type: 'varchar', default: '' })
  userId!: string;

  @Column({ name: 'workflow_id', type: 'varchar' })
  workflowId!: string;

  @Column({ name: 'run_id', type: 'varchar' })
  runId!: string;

  @Column({ name: 'expires_at', type: Date })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

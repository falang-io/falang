import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Why the test bot was blocked for an account: too many messages the messenger refused because the bot can't reach the chat. */
export const SANDBOX_BLOCK_REASON_UNREACHABLE = 'unreachable_chats';

/**
 * The test bot of one messenger is blocked for one account (ADR 0073 (private)): every project the account owns loses
 * the relay, new connect links and the routing of incoming messages until an admin lifts the block. No foreign keys, like
 * the neighbouring tables.
 */
@Entity('sandbox_bot_blocks')
@Unique('UQ_sandbox_bot_blocks_user', ['vendor', 'userId'])
export class SandboxBotBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  reason!: string;

  /** The project whose call tipped the counter over, for the admin's context. */
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

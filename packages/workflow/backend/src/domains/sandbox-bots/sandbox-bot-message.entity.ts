import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * A message the relay saw a project create through a test bot (ADR 0073 (private)), recorded for messengers whose edit
 * calls address a message by id alone (MAX): the call is allowed only for a message this project sent into a chat that is
 * still bound to it. No foreign keys, like the neighbouring tables.
 */
@Entity('sandbox_bot_messages')
@Unique('UQ_sandbox_bot_messages_message', ['vendor', 'messageId'])
@Index('IDX_sandbox_bot_messages_chat', ['vendor', 'chatId', 'projectId'])
export class SandboxBotMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  vendor!: string;

  @Column({ name: 'message_id', type: 'varchar' })
  messageId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'chat_id', type: 'varchar' })
  chatId!: string;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}

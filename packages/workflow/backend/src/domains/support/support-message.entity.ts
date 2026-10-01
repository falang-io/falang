import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TSupportAuthorRole = 'user' | 'admin';

/** One message of a user's support thread (the thread is the user — one per user). */
@Entity('support_messages')
@Index('IDX_support_messages_user_created', ['userId', 'createdAt'])
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'author_role', type: 'varchar' })
  authorRole!: TSupportAuthorRole;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'text' })
  text!: string;

  /** Set explicitly by the service (millisecond precision, so `after` filtering is exact on every driver). */
  @Column({ name: 'created_at', type: Date })
  createdAt!: Date;

  /** For a user's message: when an admin read it; for an admin's message: when the user read it. */
  @Column({ name: 'read_at', type: Date, nullable: true })
  readAt!: Date | null;
}

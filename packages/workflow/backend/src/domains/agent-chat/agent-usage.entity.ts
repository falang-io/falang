import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per vendor call made for the in-app agent (community edition's `DbAgentUsageSink`). No foreign
 * keys on purpose: usage history should outlive a deleted project/user, and the cloud edition's own
 * metering does not depend on this table.
 */
@Entity('agent_usage')
@Index('IDX_agent_usage_project_created', ['projectId', 'createdAt'])
export class AgentUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  model!: string;

  @Column({ name: 'prompt_tokens', type: 'integer', nullable: true })
  promptTokens!: number | null;

  @Column({ name: 'completion_tokens', type: 'integer', nullable: true })
  completionTokens!: number | null;

  /** Part of `promptTokens` served from the vendor's prompt cache; null when it reported none. */
  @Column({ name: 'cached_prompt_tokens', type: 'integer', nullable: true })
  cachedPromptTokens!: number | null;

  /** Null when the vendor sent no `usage` object. */
  @Column({ name: 'total_tokens', type: 'integer', nullable: true })
  totalTokens!: number | null;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

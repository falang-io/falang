import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per upstream call of the built-in AI provider (ADR 0081 (private), community `DbAiProviderUsageSink`). No
 * foreign keys on purpose: usage history outlives a deleted project/user, and the hosted edition's billing does not
 * depend on this table.
 */
@Entity('ai_provider_usage')
@Index('IDX_ai_provider_usage_project_created', ['projectId', 'createdAt'])
export class AiProviderUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** The project owner at call time (the payer). */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  /** `dev` | `prod`. */
  @Column({ type: 'varchar' })
  env!: string;

  @Column({ type: 'varchar' })
  model!: string;

  /** `chat` | `image` | `transcribe`. */
  @Column({ type: 'varchar' })
  kind!: string;

  @Column({ name: 'prompt_tokens', type: 'integer', nullable: true })
  promptTokens!: number | null;

  @Column({ name: 'completion_tokens', type: 'integer', nullable: true })
  completionTokens!: number | null;

  @Column({ name: 'cached_prompt_tokens', type: 'integer', nullable: true })
  cachedPromptTokens!: number | null;

  /** Null when the upstream sent no `usage` object. */
  @Column({ name: 'total_tokens', type: 'integer', nullable: true })
  totalTokens!: number | null;

  /** Image generation: how many images the reply carried (ADR 0081 (private) phase 4); null for other kinds. */
  @Column({ type: 'integer', nullable: true })
  images!: number | null;

  /** Duration-billed transcription (`whisper-1`): the seconds of audio the upstream reported; null otherwise. */
  @Column({ name: 'audio_seconds', type: 'real', nullable: true })
  audioSeconds!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

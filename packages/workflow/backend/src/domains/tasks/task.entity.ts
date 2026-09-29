import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Project } from '../projects/projects/project.entity.js';
import type { ITaskAttachment, ITaskOption, TTaskStatus } from './task.types.js';

/**
 * The durable record of a `human-task` node's ask — see ADR 0040 (private)
 * §2 and the fixed phase-4 contract. The workflow's own history is the source of truth for *what the
 * flow did* with the answer; this row is what the project owner sees on the Tasks page. Unique on
 * `(workflow_id, run_id, node_id)` so a retried ask activity upserts (`TasksService.createOrGet`)
 * rather than duplicating.
 */
@Entity('tasks')
@Unique(['workflowId', 'runId', 'nodeId'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  env!: 'dev' | 'prod';

  @Column({ name: 'workflow_id', type: 'varchar' })
  workflowId!: string;

  @Column({ name: 'run_id', type: 'varchar' })
  runId!: string;

  @Column({ name: 'task_queue', type: 'varchar' })
  taskQueue!: string;

  @Column({ name: 'node_id', type: 'varchar' })
  nodeId!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Structured context displayed as a JSON/`Descriptions` block — display only, never edited by the resolver. */
  @Column({ type: 'jsonb', nullable: true })
  payload!: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: readonly ITaskAttachment[] | null;

  /** The buttons the owner sees — `[{ label, dataType, prompt? }]`, see `ITaskOption`. */
  @Column({ type: 'jsonb' })
  options!: readonly ITaskOption[];

  @Column({ type: 'varchar' })
  status!: TTaskStatus;

  /** The chosen option's `label`, or `null` while `status === 'open'`. */
  @Column({ type: 'varchar', nullable: true })
  answer!: string | null;

  /** The typed value collected from the resolver, `null` for a `void` option or before resolution. */
  @Column({ name: 'answer_data', type: 'jsonb', nullable: true })
  answerData!: unknown | null;

  /** The resolving user's id — `null` until resolved (or for `expired`/`cancelled`/`orphaned`). */
  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  /** `null` when the node has no `timeout` configured. */
  @Column({ name: 'due_at', type: Date, nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'resolved_at', type: Date, nullable: true })
  resolvedAt!: Date | null;

  /** Set (alongside `status: 'orphaned'`) when the resolve signal hit `WorkflowNotFoundError` — see `TasksService.resolve`. */
  @Column({ name: 'orphan_reason', type: 'text', nullable: true })
  orphanReason!: string | null;
}

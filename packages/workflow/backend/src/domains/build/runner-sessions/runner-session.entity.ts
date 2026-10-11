import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One stretch of a runner Deployment being up (ADR 0067 (private) §1): opened when `RunnerProcessManager.start`
 * creates it (or when the idle sweep finds a Deployment nobody recorded), closed by every stop path. No foreign
 * keys on purpose — uptime history outlives a deleted project, and a billing meter reads it independently.
 */
@Entity('runner_sessions')
@Index('IDX_runner_sessions_project_started', ['projectId', 'startedAt'])
export class RunnerSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar' })
  env!: 'dev' | 'prod';

  /** `null` for the unversioned dev deployment. */
  @Column({ name: 'build_id', type: 'varchar', nullable: true })
  buildId!: string | null;

  @Column({ name: 'deployment_name', type: 'varchar' })
  deploymentName!: string;

  @Column({ name: 'task_queue', type: 'varchar' })
  taskQueue!: string;

  @Column({ name: 'started_at', type: Date })
  startedAt!: Date;

  @Column({ name: 'last_seen_at', type: Date })
  lastSeenAt!: Date;

  /** `null` while the session is open. */
  @Column({ name: 'ended_at', type: Date, nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'end_reason', type: 'varchar', nullable: true })
  endReason!: TRunnerSessionEndReason | null;
}

export type TRunnerSessionEndReason = 'stopped' | 'idle' | 'replaced' | 'suspended' | 'lost' | 'shutdown';

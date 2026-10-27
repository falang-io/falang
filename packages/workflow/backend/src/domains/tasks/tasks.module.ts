import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { TEMPORAL_TENANCY, type ITemporalTenancy } from '@falang/workflow-gateway';
import { In, type Repository } from 'typeorm';
import { BuildModule } from '../build/build/build.module.js';
import { BuildService } from '../build/build/build.service.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { RunJournalModule } from '../run-journal/run-journal.module.js';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { ProjectMembersService } from '../projects/members/project-members.service.js';
import { User } from '../users/users/user.entity.js';
import { createDescribeWorkflow, createSignalWorkflow } from './create-signal-workflow.js';
import { InternalTasksController } from './internal-tasks.controller.js';
import { Task } from './task.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService, type TDescribeWorkflow, type TSignalWorkflow } from './tasks.service.js';

/** DI token for `TSignalWorkflow` — real implementation below (signals through the project's own namespace client, ADR 0057 (private)); tests construct `TasksService` directly with a fake closure instead of going through this token (see `tasks.service.test.ts`). */
export const SIGNAL_WORKFLOW = Symbol('SIGNAL_WORKFLOW');
/** DI token for `TDescribeWorkflow` (P1-11). */
export const DESCRIBE_WORKFLOW = Symbol('DESCRIBE_WORKFLOW');

/**
 * See ADR 0040 (private) §2/§4 and the fixed phase-4 contract.
 * `BuildModule` is imported (not just injected via a narrower port) purely for
 * `BuildService.ensureRunnerRunning` — this creates no cycle, since `BuildModule` never imports
 * `TasksModule` back. `ProjectTokenModule` backs `InternalTasksController`'s `ProjectTokenGuard`
 * (same as `internal-files`/`internal-credentials`); `ProjectsModule` backs the owner-scoped JWT
 * routes' ownership checks (`TasksController`, via `TasksService`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Project, User]),
    ProjectsModule,
    ProjectTokenModule,
    BuildModule,
    RunJournalModule,
  ],
  controllers: [TasksController, InternalTasksController],
  providers: [
    {
      provide: SIGNAL_WORKFLOW,
      inject: [TEMPORAL_TENANCY],
      useFactory: (tenancy: ITemporalTenancy): TSignalWorkflow => createSignalWorkflow(tenancy),
    },
    {
      provide: DESCRIBE_WORKFLOW,
      inject: [TEMPORAL_TENANCY],
      useFactory: (tenancy: ITemporalTenancy): TDescribeWorkflow => createDescribeWorkflow(tenancy),
    },
    {
      provide: TasksService,
      inject: [
        getRepositoryToken(Task),
        getRepositoryToken(User),
        ProjectsService,
        ProjectMembersService,
        BuildService,
        SIGNAL_WORKFLOW,
        DESCRIBE_WORKFLOW,
        RunJournalService,
      ],
      useFactory: (
        tasks: Repository<Task>,
        users: Repository<User>,
        projectsService: ProjectsService,
        membersService: ProjectMembersService,
        buildService: BuildService,
        signalWorkflow: TSignalWorkflow,
        describeWorkflow: TDescribeWorkflow,
        journal: RunJournalService,
      ) =>
        new TasksService({
          tasks,
          projectsService,
          pickAssignee: async (projectId) =>
            membersService.pickTaskAssignee(projectId, await projectsService.getOwnerId(projectId)),
          usernames: async (userIds) => {
            const rows = await users.find({ select: { id: true, username: true }, where: { id: In([...userIds]) } });
            return new Map(rows.map((row) => [row.id, row.username]));
          },
          ensureRunnerRunning: (projectId, env, taskQueue) =>
            buildService.ensureRunnerRunning(projectId, env, taskQueue),
          signalWorkflow,
          describeWorkflow,
          journal,
        }),
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}

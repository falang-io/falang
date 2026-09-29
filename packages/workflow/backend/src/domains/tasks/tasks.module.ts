import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Client, Connection } from '@temporalio/client';
import type { Repository } from 'typeorm';
import { BuildModule } from '../build/build/build.module.js';
import { BuildService } from '../build/build/build.service.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { InternalTasksController } from './internal-tasks.controller.js';
import { Task } from './task.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService, type TSignalWorkflow } from './tasks.service.js';

/** DI token for `TSignalWorkflow` — real implementation below (connect-per-call, same posture as `workflow-debug-client-impl.ts`'s `sendDebugSignal`); tests construct `TasksService` directly with a fake closure instead of going through this token (see `tasks.service.test.ts`). */
export const SIGNAL_WORKFLOW = Symbol('SIGNAL_WORKFLOW');

const connect = (temporalAddress: string | undefined): Promise<Connection> =>
  temporalAddress ? Connection.connect({ address: temporalAddress }) : Connection.connect();

/**
 * See ADR 0040 (private) §2/§4 and the fixed phase-4 contract.
 * `BuildModule` is imported (not just injected via a narrower port) purely for
 * `BuildService.ensureRunnerRunning` — this creates no cycle, since `BuildModule` never imports
 * `TasksModule` back. `ProjectTokenModule` backs `InternalTasksController`'s `ProjectTokenGuard`
 * (same as `internal-files`/`internal-credentials`); `ProjectsModule` backs the owner-scoped JWT
 * routes' ownership checks (`TasksController`, via `TasksService`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Task, Project]), ProjectsModule, ProjectTokenModule, BuildModule],
  controllers: [TasksController, InternalTasksController],
  providers: [
    {
      provide: SIGNAL_WORKFLOW,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TSignalWorkflow => {
        const temporalAddress = config.get<string>('TEMPORAL_ADDRESS');
        const namespace = config.get<string>('TEMPORAL_NAMESPACE');
        return async (workflowId, runId, signalName, payload) => {
          const connection = await connect(temporalAddress);
          try {
            const client = new Client({ connection, namespace });
            await client.workflow.getHandle(workflowId, runId).signal(signalName, payload);
          } finally {
            await connection.close();
          }
        };
      },
    },
    {
      provide: TasksService,
      inject: [getRepositoryToken(Task), ProjectsService, BuildService, SIGNAL_WORKFLOW],
      useFactory: (tasks: Repository<Task>, projectsService: ProjectsService, buildService: BuildService, signalWorkflow: TSignalWorkflow) =>
        new TasksService({
          tasks,
          projectsService,
          ensureRunnerRunning: (projectId, env, taskQueue) => buildService.ensureRunnerRunning(projectId, env, taskQueue),
          signalWorkflow,
        }),
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}

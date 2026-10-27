import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { vi } from 'vitest';
import { JwtAuthGuard } from '../auth/auth/jwt-auth.guard.js';
import { AuthModule } from '../auth/auth/auth.module.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { Document } from '../projects/documents/document.entity.js';
import { Folder } from '../projects/folders/folder.entity.js';
import { RunJournalEntry } from '../run-journal/run-journal-entry.entity.js';
import { RunJournalModule } from '../run-journal/run-journal.module.js';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectMember } from '../projects/members/project-member.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { ProjectMembersService } from '../projects/members/project-members.service.js';
import { UserLimits } from '../admin/user-limits/user-limits.entity.js';
import { User } from '../users/users/user.entity.js';
import { UsersModule } from '../users/users/users.module.js';
import { auth } from '../../test-utils/e2e-app.js';
import { InternalTasksController } from './internal-tasks.controller.js';
import { Task } from './task.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

type TEnsureRunnerRunning = (projectId: string, env: 'dev' | 'prod', taskQueue: string) => Promise<void>;
type TDescribe = (projectId: string, workflowId: string, runId: string) => Promise<{ taskQueue: string } | null>;

type TSignal = (
  projectId: string,
  workflowId: string,
  runId: string,
  signalName: string,
  payload: unknown,
) => Promise<void>;

/**
 * The tasks domain over its own in-memory sqlite testing module — see `tasks.e2e.test.ts` for why it doesn't reuse
 * `test-utils/e2e-app.ts`. Signs users up through `POST /auth/register` (the caller stubs `SELF_SERVICE_SIGNUP`).
 */
export const createTasksTestApp = async () => {
  const ensureRunnerRunning = vi.fn<TEnsureRunnerRunning>(() => Promise.resolve());
  const signalWorkflow = vi.fn<TSignal>(() => Promise.resolve());
  const describeWorkflow = vi.fn<TDescribe>((projectId) => Promise.resolve({ taskQueue: `workflow-dev-${projectId}` }));

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        dropSchema: true,
        synchronize: true,
        entities: [User, Project, ProjectMember, Folder, Document, Task, RunJournalEntry, UserLimits],
      }),
      TypeOrmModule.forFeature([Task]),
      UsersModule,
      AuthModule,
      ProjectsModule,
      ProjectTokenModule,
      RunJournalModule,
    ],
    controllers: [TasksController, InternalTasksController],
    providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      {
        provide: TasksService,
        inject: [getRepositoryToken(Task), ProjectsService, ProjectMembersService, RunJournalService],
        useFactory: (
          tasks: Repository<Task>,
          projectsService: ProjectsService,
          membersService: ProjectMembersService,
          journal: RunJournalService,
        ) =>
          new TasksService({
            tasks,
            projectsService,
            journal,
            pickAssignee: async (projectId) =>
              membersService.pickTaskAssignee(projectId, await projectsService.getOwnerId(projectId)),
            usernames: () => Promise.resolve(new Map()),
            ensureRunnerRunning: (...args) => ensureRunnerRunning(...args) as Promise<void>,
            signalWorkflow: (...args) => signalWorkflow(...args) as Promise<void>,
            describeWorkflow: (...args) => describeWorkflow(...args),
          }),
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const registerAndLogin = async (username: string): Promise<{ token: string; userId: string }> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'password123' });
    return { token: response.body.accessToken as string, userId: response.body.user.id as string };
  };

  const createProject = async (token: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'tasks-test' });
    return response.body.id as string;
  };

  const internalToken = (projectId: string): string => app.get(ProjectTokenService).getOrCreateToken(projectId);

  const internalCreate = (projectId: string, projectToken: string, overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`/internal/tasks/${projectId}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .send({
        workflowId: 'wf-1',
        runId: 'run-1',
        taskQueue: `workflow-dev-${projectId}`,
        env: 'dev',
        nodeId: 'node-1',
        title: 'Approve invoice',
        description: 'Please approve the $500 invoice.',
        options: [
          { label: 'Approve', dataType: 'void' },
          { label: 'Reject', dataType: 'string', prompt: 'Reason' },
        ],
        ...overrides,
      });

  return {
    app,
    ensureRunnerRunning,
    signalWorkflow,
    describeWorkflow,
    registerAndLogin,
    createProject,
    internalToken,
    internalCreate,
  };
};

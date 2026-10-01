import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowNotFoundError } from '@temporalio/client';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/auth/jwt-auth.guard.js';
import { AuthModule } from '../auth/auth/auth.module.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { Document } from '../projects/documents/document.entity.js';
import { Folder } from '../projects/folders/folder.entity.js';
import { Project } from '../projects/projects/project.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { User } from '../users/users/user.entity.js';
import { UsersModule } from '../users/users/users.module.js';
import { auth } from '../../test-utils/e2e-app.js';
import { InternalTasksController } from './internal-tasks.controller.js';
import { Task } from './task.entity.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

/**
 * Real-HTTP coverage of `domains/tasks/` over its own in-memory sqlite testing module — see
 * ADR 0040 (private) and the fixed phase-4 contract. Deliberately does
 * **not** reuse the shared `test-utils/e2e-app.ts` harness or import `TasksModule`/`BuildModule`
 * as-is: `BuildModule` constructs `RunnerProcessManager` via a real `KubeConfig().loadFromDefault()`
 * at module-init time, which throws outside a real cluster/kubeconfig — the exact reason
 * `domains/mcp/mcp-test-harness.ts` already avoids importing `BuildModule` into any Nest-compiled
 * test module. `TasksController`/`InternalTasksController` (the real classes, real guards, real
 * `ValidationPipe`) are wired directly with a `TasksService` constructed from fakes for
 * `ensureRunnerRunning`/`signalWorkflow`, mirroring that harness's own "construct the service
 * manually, mount the real controllers" pattern.
 */
describe('tasks (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let ensureRunnerRunning: ReturnType<
    typeof vi.fn<(projectId: string, env: 'dev' | 'prod', taskQueue: string) => Promise<void>>
  >;
  // oxlint-disable-next-line init-declarations
  let signalWorkflow: ReturnType<
    typeof vi.fn<
      (projectId: string, workflowId: string, runId: string, signalName: string, payload: unknown) => Promise<void>
    >
  >;

  beforeEach(async () => {
    // This suite signs users up through POST /auth/register.
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
    ensureRunnerRunning = vi.fn(() => Promise.resolve());
    signalWorkflow = vi.fn(() => Promise.resolve());

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [User, Project, Folder, Document, Task],
        }),
        TypeOrmModule.forFeature([Task]),
        UsersModule,
        AuthModule,
        ProjectsModule,
        ProjectTokenModule,
      ],
      controllers: [TasksController, InternalTasksController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        {
          provide: TasksService,
          inject: [getRepositoryToken(Task), ProjectsService],
          useFactory: (tasks: Repository<Task>, projectsService: ProjectsService) =>
            new TasksService({
              tasks,
              projectsService,
              ensureRunnerRunning: (...args) => ensureRunnerRunning(...args) as Promise<void>,
              signalWorkflow: (...args) => signalWorkflow(...args) as Promise<void>,
            }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

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

  it('upserts by (workflowId, runId, nodeId) — a retried ask returns the same id', async () => {
    const { token } = await registerAndLogin('owner');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);

    const first = await internalCreate(projectId, projectToken);
    expect(first.status).toBe(201);
    expect(first.body.taskId).toEqual(expect.any(String));

    const second = await internalCreate(projectId, projectToken);
    expect(second.status).toBe(201);
    expect(second.body.taskId).toBe(first.body.taskId);
  });

  it('lists and fetches a task for the owning user, and 404s for a different user', async () => {
    const { token: ownerToken } = await registerAndLogin('owner2');
    const projectId = await createProject(ownerToken);
    const projectToken = internalToken(projectId);
    const created = await internalCreate(projectId, projectToken);
    const taskId = created.body.taskId as string;

    const list = await request(app.getHttpServer()).get('/tasks').set(auth(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: taskId, status: 'open', title: 'Approve invoice' });

    const detail = await request(app.getHttpServer()).get(`/tasks/${taskId}`).set(auth(ownerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(taskId);

    const { token: otherToken } = await registerAndLogin('someone-else');
    const otherList = await request(app.getHttpServer()).get('/tasks').set(auth(otherToken));
    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);

    const otherDetail = await request(app.getHttpServer()).get(`/tasks/${taskId}`).set(auth(otherToken));
    expect(otherDetail.status).toBe(404);
  });

  it('resolves a typed option: wakes the runner, signals the workflow, and returns the resolved task', async () => {
    const { token } = await registerAndLogin('owner3');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);
    const created = await internalCreate(projectId, projectToken);
    const taskId = created.body.taskId as string;

    const resolved = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Reject', data: 'too expensive' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('done');
    expect(resolved.body.answer).toBe('Reject');
    expect(resolved.body.answerData).toBe('too expensive');

    expect(ensureRunnerRunning).toHaveBeenCalledWith(projectId, 'dev', `workflow-dev-${projectId}`);
    expect(signalWorkflow).toHaveBeenCalledWith(
      projectId,
      'wf-1',
      'run-1',
      'humanTaskAnswer',
      expect.objectContaining({ messageId: taskId, value: 'Reject', data: 'too expensive' }),
    );

    // Already resolved — a second resolve loses the optimistic race.
    const again = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(again.status).toBe(409);
  });

  it('flips to orphaned when the signal hits a gone workflow, closes an open task via the internal API, and no-ops closing an already-closed one', async () => {
    const { token } = await registerAndLogin('owner4');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);

    // First task: resolve races a dead workflow.
    const orphanCandidate = await internalCreate(projectId, projectToken, { nodeId: 'node-orphan' });
    const orphanTaskId = orphanCandidate.body.taskId as string;
    signalWorkflow.mockImplementationOnce(() =>
      Promise.reject(new WorkflowNotFoundError('workflow not found', 'wf-1', 'run-1')),
    );

    const resolved = await request(app.getHttpServer())
      .post(`/tasks/${orphanTaskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('orphaned');
    expect(resolved.body.orphanReason).toBe('workflow not found');

    // Second task: internal close (a timeout branch) transitions open -> expired, then no-ops.
    const expiring = await internalCreate(projectId, projectToken, { nodeId: 'node-expiring' });
    const expiringTaskId = expiring.body.taskId as string;

    const closed = await request(app.getHttpServer())
      .post(`/internal/tasks/${projectId}/${expiringTaskId}/close`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .send({ status: 'expired' });
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({});

    const expiredDetail = await request(app.getHttpServer()).get(`/tasks/${expiringTaskId}`).set(auth(token));
    expect(expiredDetail.body.status).toBe('expired');

    // Resolving an already-expired task 409s.
    const resolveExpired = await request(app.getHttpServer())
      .post(`/tasks/${expiringTaskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(resolveExpired.status).toBe(409);

    // Closing it again (internal, no longer open) is a silent no-op.
    const closeAgain = await request(app.getHttpServer())
      .post(`/internal/tasks/${projectId}/${expiringTaskId}/close`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .send({ status: 'cancelled' });
    expect(closeAgain.status).toBe(200);
    const stillExpired = await request(app.getHttpServer()).get(`/tasks/${expiringTaskId}`).set(auth(token));
    expect(stillExpired.body.status).toBe('expired');
  });

  it('rejects an internal create/close without a valid project token', async () => {
    const { token } = await registerAndLogin('owner5');
    const projectId = await createProject(token);

    const created = await internalCreate(projectId, 'not-the-real-token');
    expect(created.status).toBe(403);
  });
});

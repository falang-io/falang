import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestDbOptions } from '../../test-utils/test-db-options.js';
import type { TDescribeWorkflow } from '../tasks/tasks.service.js';
import type { RegisterMessageWaitDto } from './dto/register-message-wait.dto.js';
import { MessageWait } from './message-wait.entity.js';
import { MESSAGE_WAIT_DESCRIBE_WORKFLOW, MessageWaitsService } from './message-waits.service.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-09T10:00:00Z');

const input = (overrides: Partial<RegisterMessageWaitDto> = {}): RegisterMessageWaitDto => ({
  vendor: 'telegram',
  credentialId: 'cred-1',
  env: 'dev',
  chatId: '42',
  userId: null,
  workflowId: 'tg-doc-42',
  runId: 'run-1',
  timeoutMs: 600_000,
  ...overrides,
});

const claimParams = (userId: string | null = '7') => ({
  projectId: PROJECT,
  env: 'dev' as const,
  vendor: 'telegram',
  credentialId: 'cred-1',
  chatId: '42',
  userId,
});

describe('MessageWaitsService (ADR 0079)', () => {
  // oxlint-disable-next-line init-declarations
  let moduleRef: TestingModule;
  // oxlint-disable-next-line init-declarations
  let service: MessageWaitsService;
  // oxlint-disable-next-line init-declarations
  let describeWorkflow: ReturnType<typeof vi.fn<TDescribeWorkflow>>;

  beforeEach(async () => {
    describeWorkflow = vi.fn<TDescribeWorkflow>().mockResolvedValue({ taskQueue: `workflow-dev-${PROJECT}` });
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...buildTestDbOptions(), entities: [MessageWait] }),
        TypeOrmModule.forFeature([MessageWait]),
      ],
      providers: [MessageWaitsService, { provide: MESSAGE_WAIT_DESCRIBE_WORKFLOW, useValue: describeWorkflow }],
    }).compile();
    service = moduleRef.get(MessageWaitsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('registers a wait and hands it to the first matching message, once', async () => {
    const waitId = await service.register(PROJECT, input(), NOW);
    expect(describeWorkflow).toHaveBeenCalledWith(PROJECT, 'tg-doc-42', 'run-1');

    await expect(service.claim(claimParams(), NOW)).resolves.toEqual({
      waitId,
      workflowId: 'tg-doc-42',
      runId: 'run-1',
    });
    await expect(service.claim(claimParams(), NOW)).resolves.toBeNull();
  });

  it('refuses a run that does not exist or lives on another project task queue', async () => {
    describeWorkflow.mockResolvedValueOnce(null);
    await expect(service.register(PROJECT, input(), NOW)).rejects.toBeInstanceOf(NotFoundException);
    describeWorkflow.mockResolvedValueOnce({ taskQueue: `workflow-dev-${OTHER_PROJECT}` });
    await expect(service.register(PROJECT, input(), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    describeWorkflow.mockResolvedValueOnce({ taskQueue: `workflow-dev-${PROJECT}` });
    await expect(service.register(PROJECT, input({ env: 'prod' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("prefers the sender's own wait over one open to anyone, and leaves a wait for someone else alone", async () => {
    const anyone = await service.register(PROJECT, input({ runId: 'run-any' }), NOW);
    const mine = await service.register(
      PROJECT,
      input({ userId: '7', workflowId: 'tg-doc-42-7', runId: 'run-7' }),
      NOW,
    );
    await service.register(PROJECT, input({ userId: '8', workflowId: 'tg-doc-42-8', runId: 'run-8' }), NOW);

    await expect(service.claim(claimParams('7'), NOW)).resolves.toMatchObject({ waitId: mine });
    await expect(service.claim(claimParams('9'), NOW)).resolves.toMatchObject({ waitId: anyone });
    await expect(service.claim(claimParams('9'), NOW)).resolves.toBeNull();
    // A message without a sender only matches a wait open to anyone.
    await expect(service.claim(claimParams(null), NOW)).resolves.toBeNull();
  });

  it('matches only its own project, env, vendor, credential and chat', async () => {
    await service.register(PROJECT, input(), NOW);
    const foreign = [
      { ...claimParams(), projectId: OTHER_PROJECT },
      { ...claimParams(), env: 'prod' as const },
      { ...claimParams(), vendor: 'max' },
      { ...claimParams(), credentialId: 'cred-2' },
      { ...claimParams(), chatId: '43' },
    ];
    await expect(Promise.all(foreign.map((params) => service.claim(params, NOW)))).resolves.toEqual(
      foreign.map(() => null),
    );
    await expect(service.claim(claimParams(), NOW)).resolves.not.toBeNull();
  });

  it('replaces an older wait with the same key', async () => {
    await service.register(PROJECT, input({ runId: 'run-old' }), NOW);
    const newer = await service.register(PROJECT, input({ runId: 'run-new' }), NOW);
    await expect(service.claim(claimParams(), NOW)).resolves.toMatchObject({ waitId: newer, runId: 'run-new' });
    await expect(service.claim(claimParams(), NOW)).resolves.toBeNull();
  });

  it('ignores and sweeps expired waits; release deletes a wait of its own project only', async () => {
    await service.register(PROJECT, input({ timeoutMs: 1000 }), NOW);
    const later = new Date(NOW.getTime() + 5 * 60_000);
    await expect(service.claim(claimParams(), later)).resolves.toBeNull();
    await expect(service.sweep(later)).resolves.toBe(1);

    const waitId = await service.register(PROJECT, input(), NOW);
    await expect(service.release(OTHER_PROJECT, waitId)).resolves.toBe(false);
    await expect(service.release(PROJECT, waitId)).resolves.toBe(true);
    await expect(service.release(PROJECT, waitId)).resolves.toBe(false);
    await expect(service.claim(claimParams(), NOW)).resolves.toBeNull();
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestDbOptions } from '../../test-utils/test-db-options.js';
import type { TDescribeWorkflow } from '../tasks/tasks.service.js';
import { ButtonWait } from './button-wait.entity.js';
import { BUTTON_WAIT_DESCRIBE_WORKFLOW, ButtonWaitsService } from './button-waits.service.js';
import type { RegisterButtonWaitDto } from './dto/register-button-wait.dto.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-20T10:00:00Z');

const input = (overrides: Partial<RegisterButtonWaitDto> = {}): RegisterButtonWaitDto => ({
  waitId: 'run-1:1',
  vendor: 'telegram',
  credentialId: 'cred-1',
  env: 'dev',
  chatId: '42',
  messageId: '100',
  workflowId: 'tg-doc-42',
  runId: 'run-1',
  timeoutMs: 600_000,
  ...overrides,
});

const claim = (overrides: Record<string, string> = {}) => ({
  projectId: PROJECT,
  env: 'dev' as const,
  vendor: 'telegram',
  credentialId: 'cred-1',
  waitId: 'run-1:1',
  chatId: '42',
  messageId: '100',
  ...overrides,
});

describe('ButtonWaitsService', () => {
  // oxlint-disable-next-line init-declarations
  let moduleRef: TestingModule;
  // oxlint-disable-next-line init-declarations
  let service: ButtonWaitsService;
  // oxlint-disable-next-line init-declarations
  let describeWorkflow: ReturnType<typeof vi.fn<TDescribeWorkflow>>;

  beforeEach(async () => {
    describeWorkflow = vi.fn<TDescribeWorkflow>().mockResolvedValue({ taskQueue: `workflow-dev-${PROJECT}` });
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...buildTestDbOptions(), entities: [ButtonWait] }),
        TypeOrmModule.forFeature([ButtonWait]),
      ],
      providers: [ButtonWaitsService, { provide: BUTTON_WAIT_DESCRIBE_WORKFLOW, useValue: describeWorkflow }],
    }).compile();
    service = moduleRef.get(ButtonWaitsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('claims a matching message once', async () => {
    await service.register(PROJECT, input(), NOW);
    await expect(service.claim(claim(), NOW)).resolves.toEqual({
      waitId: 'run-1:1',
      workflowId: 'tg-doc-42',
      runId: 'run-1',
    });
    await expect(service.claim(claim(), NOW)).resolves.toBeNull();
  });

  it('does not claim a foreign, stale or wrong-message wait', async () => {
    await service.register(PROJECT, input(), NOW);
    const foreign = [
      claim({ projectId: OTHER_PROJECT }),
      claim({ env: 'prod' }),
      claim({ vendor: 'max' }),
      claim({ credentialId: 'cred-2' }),
      claim({ chatId: '43' }),
      claim({ messageId: '101' }),
      claim({ waitId: 'run-1:2' }),
    ];
    await expect(Promise.all(foreign.map((params) => service.claim(params, NOW)))).resolves.toEqual(
      foreign.map(() => null),
    );
    await expect(service.claim(claim(), NOW)).resolves.not.toBeNull();
  });

  it('validates the run and its environment task queue', async () => {
    describeWorkflow.mockResolvedValueOnce(null);
    await expect(service.register(PROJECT, input(), NOW)).rejects.toBeInstanceOf(NotFoundException);
    describeWorkflow.mockResolvedValueOnce({ taskQueue: `workflow-dev-${OTHER_PROJECT}` });
    await expect(service.register(PROJECT, input(), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    describeWorkflow.mockResolvedValueOnce({ taskQueue: `workflow-dev-${PROJECT}` });
    await expect(service.register(PROJECT, input({ env: 'prod' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('expires, sweeps and releases only its own project wait', async () => {
    await service.register(PROJECT, input({ timeoutMs: 1000 }), NOW);
    const later = new Date(NOW.getTime() + 5 * 60_000);
    await expect(service.claim(claim(), later)).resolves.toBeNull();
    await expect(service.sweep(later)).resolves.toBe(1);

    await service.register(PROJECT, input(), NOW);
    await expect(service.release(OTHER_PROJECT, 'run-1:1')).resolves.toBe(false);
    await expect(service.release(PROJECT, 'run-1:1')).resolves.toBe(true);
    await expect(service.release(PROJECT, 'run-1:1')).resolves.toBe(false);
  });
});

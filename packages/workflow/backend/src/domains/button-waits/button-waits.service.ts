import {
  IntegrationsRuntimeService,
  type IButtonWaitClaimParams,
  type IButtonWaitPort,
  type IClaimedButtonWait,
} from '@falang/workflow-gateway';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, type Repository } from 'typeorm';
import { expectedTaskQueue, type TDescribeWorkflow } from '../tasks/tasks.service.js';
import { ButtonWait } from './button-wait.entity.js';
import { BUTTON_WAIT_EXPIRY_GRACE_MS, BUTTON_WAIT_SWEEP_INTERVAL_MS } from './button-waits.constants.js';
import type { RegisterButtonWaitDto } from './dto/register-button-wait.dto.js';

export const BUTTON_WAIT_DESCRIBE_WORKFLOW = Symbol('BUTTON_WAIT_DESCRIBE_WORKFLOW');

@Injectable()
export class ButtonWaitsService implements IButtonWaitPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ButtonWaitsService.name);
  private readonly repository: Repository<ButtonWait>;
  private readonly describeWorkflow: TDescribeWorkflow;
  private readonly runtime: IntegrationsRuntimeService | undefined;
  private sweepHandle: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(ButtonWait) repository: Repository<ButtonWait>,
    @Inject(BUTTON_WAIT_DESCRIBE_WORKFLOW) describeWorkflow: TDescribeWorkflow,
    @Optional() @Inject(IntegrationsRuntimeService) runtime?: IntegrationsRuntimeService,
  ) {
    this.repository = repository;
    this.describeWorkflow = describeWorkflow;
    this.runtime = runtime;
  }

  onModuleInit(): void {
    this.runtime?.setButtonWaits(this);
    this.sweepHandle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Button wait sweep failed', error instanceof Error ? error.stack : error);
      });
    }, BUTTON_WAIT_SWEEP_INTERVAL_MS);
    this.sweepHandle.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
  }

  async register(projectId: string, input: RegisterButtonWaitDto, now: Date = new Date()): Promise<string> {
    const described = await this.describeWorkflow(projectId, input.workflowId, input.runId);
    if (!described) throw new NotFoundException('Workflow run not found for this project');
    if (described.taskQueue !== expectedTaskQueue(projectId, input.env)) {
      throw new ForbiddenException('Workflow run does not belong to this project');
    }
    const expiresAt = new Date(now.getTime() + input.timeoutMs + BUTTON_WAIT_EXPIRY_GRACE_MS);
    await this.repository.save(
      this.repository.create({
        id: input.waitId,
        projectId,
        env: input.env,
        vendor: input.vendor,
        credentialId: input.credentialId,
        chatId: input.chatId,
        messageId: input.messageId,
        workflowId: input.workflowId,
        runId: input.runId,
        expiresAt,
      }),
    );
    return input.waitId;
  }

  async release(projectId: string, waitId: string): Promise<boolean> {
    const result = await this.repository.delete({ id: waitId, projectId });
    return (result.affected ?? 0) > 0;
  }

  async claim(params: IButtonWaitClaimParams, now: Date = new Date()): Promise<IClaimedButtonWait | null> {
    const wait = await this.repository.findOne({
      where: {
        id: params.waitId,
        projectId: params.projectId,
        env: params.env,
        vendor: params.vendor,
        credentialId: params.credentialId,
        chatId: params.chatId,
        messageId: params.messageId,
        expiresAt: MoreThan(now),
      },
    });
    if (!wait) return null;
    const result = await this.repository.delete({ id: wait.id, projectId: wait.projectId });
    if (result.affected === 0) return null;
    return { waitId: wait.id, workflowId: wait.workflowId, runId: wait.runId };
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(now) });
    return result.affected ?? 0;
  }
}

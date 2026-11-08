import {
  IntegrationsRuntimeService,
  type IClaimedMessageWait,
  type IMessageWaitClaimParams,
  type IMessageWaitPort,
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
import { In, LessThan, MoreThan, type Repository } from 'typeorm';
import { expectedTaskQueue, type TDescribeWorkflow } from '../tasks/tasks.service.js';
import type { RegisterMessageWaitDto } from './dto/register-message-wait.dto.js';
import { MessageWait } from './message-wait.entity.js';
import { WAIT_EXPIRY_GRACE_MS, WAIT_SWEEP_INTERVAL_MS } from './message-waits.constants.js';

/** DI token for the `TDescribeWorkflow` the registration check uses — tests pass a fake. */
export const MESSAGE_WAIT_DESCRIBE_WORKFLOW = Symbol('MESSAGE_WAIT_DESCRIBE_WORKFLOW');

/** `''` stands for "anyone in the chat" in the unique key. */
const ANY_USER = '';

/**
 * The registry of runs waiting for a chat's next message (ADR 0079 (private)). `register`/`release` back the internal
 * routes a reply-wait node's activities call; `claim` is the gateway's `IMessageWaitPort` (installed on boot), used by
 * every messenger ingress before its normal routing.
 */
@Injectable()
export class MessageWaitsService implements IMessageWaitPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageWaitsService.name);
  private readonly repository: Repository<MessageWait>;
  private readonly describeWorkflow: TDescribeWorkflow;
  private readonly runtime: IntegrationsRuntimeService | undefined;
  private sweepHandle: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(MessageWait) repository: Repository<MessageWait>,
    @Inject(MESSAGE_WAIT_DESCRIBE_WORKFLOW) describeWorkflow: TDescribeWorkflow,
    @Optional() @Inject(IntegrationsRuntimeService) runtime?: IntegrationsRuntimeService,
  ) {
    this.repository = repository;
    this.describeWorkflow = describeWorkflow;
    this.runtime = runtime;
  }

  onModuleInit(): void {
    this.runtime?.setMessageWaits(this);
    this.sweepHandle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Message wait sweep failed', error instanceof Error ? error.stack : error);
      });
    }, WAIT_SWEEP_INTERVAL_MS);
    this.sweepHandle.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
  }

  /**
   * Records a wait for `projectId`. The run must exist in the project's namespace on the env's task queue (the same
   * check tasks make, security audit P1-11), so a pod can only park its own project's runs. Replaces an older wait
   * with the same key. Returns the wait id (the node correlates the signal by it).
   */
  async register(projectId: string, input: RegisterMessageWaitDto, now: Date = new Date()): Promise<string> {
    const described = await this.describeWorkflow(projectId, input.workflowId, input.runId);
    if (!described) throw new NotFoundException('Workflow run not found for this project');
    if (described.taskQueue !== expectedTaskQueue(projectId, input.env)) {
      throw new ForbiddenException('Workflow run does not belong to this project');
    }
    const key = {
      projectId,
      env: input.env,
      vendor: input.vendor,
      credentialId: input.credentialId,
      chatId: input.chatId,
      userId: input.userId ?? ANY_USER,
    };
    const expiresAt = new Date(now.getTime() + input.timeoutMs + WAIT_EXPIRY_GRACE_MS);
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(MessageWait);
      await repository.delete(key);
      const saved = await repository.save(
        repository.create({ ...key, workflowId: input.workflowId, runId: input.runId, expiresAt }),
      );
      return saved.id;
    });
  }

  /** Deletes the wait (timeout or cancellation). `false` when it no longer exists — already claimed or swept. */
  async release(projectId: string, waitId: string): Promise<boolean> {
    const result = await this.repository.delete({ id: waitId, projectId });
    return (result.affected ?? 0) > 0;
  }

  /** `IMessageWaitPort.claim`: the sender's own unexpired wait first, else one open to anyone; deleted on the way out. */
  async claim(params: IMessageWaitClaimParams, now: Date = new Date()): Promise<IClaimedMessageWait | null> {
    const users = params.userId === null ? [ANY_USER] : [params.userId, ANY_USER];
    const candidates = await this.repository.find({
      where: {
        projectId: params.projectId,
        env: params.env,
        vendor: params.vendor,
        credentialId: params.credentialId,
        chatId: params.chatId,
        userId: In(users),
        expiresAt: MoreThan(now),
      },
    });
    const wait = candidates.find((row) => row.userId !== ANY_USER) ?? candidates[0];
    if (!wait) return null;
    const result = await this.repository.delete({ id: wait.id });
    // Another message claimed it in between (two webhooks at once): this one routes as usual.
    if (result.affected === 0) return null;
    return { waitId: wait.id, workflowId: wait.workflowId, runId: wait.runId };
  }

  /** Removes expired waits — their nodes have long timed out. */
  async sweep(now: Date = new Date()): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(now) });
    return result.affected ?? 0;
  }
}

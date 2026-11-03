import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { UsersService } from '../users/users/users.service.js';
import { SANDBOX_BLOCK_REASON_UNREACHABLE, SandboxBotBlock } from './sandbox-bot-block.entity.js';

/** At most this many messages a test bot sends for one account per hour (sliding window). */
export const SANDBOX_MESSAGES_PER_HOUR = 100;
/** This many "the bot can't reach the chat" answers within an hour block the test bot for the account. */
export const SANDBOX_UNREACHABLE_PER_HOUR = 15;
const HOUR_MS = 60 * 60_000;

export interface ISandboxBlockRow {
  readonly id: string;
  readonly vendor: string;
  readonly userId: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly reason: string;
  readonly projectId: string | null;
  readonly createdAt: string;
}

const keyOf = (vendor: string, userId: string): string => `${vendor}:${userId}`;

/**
 * Abuse protection of the shared test bots (ADR 0073 (private)), counted per messenger and per **project owner** (like
 * every other limit): a sliding hour of sent messages (`SANDBOX_MESSAGES_PER_HOUR`) and of messages the messenger refused
 * because the bot can't reach the chat — blocked, never started, account gone (`SANDBOX_UNREACHABLE_PER_HOUR`). Reaching
 * the second limit stores a block that only an admin lifts. The windows live in memory (one backend replica, like the
 * relay's other limiters; a restart forgets them), the blocks in `sandbox_bot_blocks`.
 */
@Injectable()
export class SandboxAbuseService {
  private readonly logger = new Logger(SandboxAbuseService.name);
  private readonly blocks: Repository<SandboxBotBlock>;
  private readonly users: UsersService;
  private readonly journal: RunJournalService | undefined;
  private readonly messages = new Map<string, number[]>();
  private readonly unreachable = new Map<string, number[]>();
  /** `vendor:userId` → blocked; filled on first read, kept in step by `block`/`unblock`. */
  private readonly blockedCache = new Map<string, boolean>();
  now: () => number = () => Date.now();

  constructor(
    @InjectRepository(SandboxBotBlock) blocks: Repository<SandboxBotBlock>,
    @Inject(UsersService) users: UsersService,
    @Optional() @Inject(RunJournalService) journal?: RunJournalService,
  ) {
    this.blocks = blocks;
    this.users = users;
    this.journal = journal;
  }

  /** The timestamps of `window[key]` younger than an hour (the array is trimmed in place). */
  private recent(window: Map<string, number[]>, key: string): number[] {
    const cutoff = this.now() - HOUR_MS;
    const stamps = window.get(key) ?? [];
    while (stamps.length > 0 && (stamps[0] ?? 0) <= cutoff) stamps.shift();
    window.set(key, stamps);
    return stamps;
  }

  async isBlocked(vendor: string, userId: string): Promise<boolean> {
    const key = keyOf(vendor, userId);
    if (this.blockedCache.has(key)) return this.blockedCache.get(key) === true;
    const blocked = (await this.blocks.countBy({ vendor, userId })) > 0;
    this.blockedCache.set(key, blocked);
    return blocked;
  }

  /** Takes one message slot: `0`, or the seconds until the oldest message of the hour leaves the window. */
  takeMessage(vendor: string, userId: string): number {
    const stamps = this.recent(this.messages, keyOf(vendor, userId));
    if (stamps.length >= SANDBOX_MESSAGES_PER_HOUR) {
      return Math.max(1, Math.ceil(((stamps[0] ?? 0) + HOUR_MS - this.now()) / 1000));
    }
    stamps.push(this.now());
    return 0;
  }

  /** Counts one undeliverable message; the one that reaches the limit blocks the account. Returns whether it did. */
  async recordUnreachable(
    vendor: string,
    userId: string,
    context: { projectId: string; chatId: string | null },
  ): Promise<boolean> {
    const stamps = this.recent(this.unreachable, keyOf(vendor, userId));
    stamps.push(this.now());
    if (stamps.length < SANDBOX_UNREACHABLE_PER_HOUR || (await this.isBlocked(vendor, userId))) return false;
    await this.block(vendor, userId, SANDBOX_BLOCK_REASON_UNREACHABLE, context.projectId);
    this.logger.warn(
      `[security] Test bot ${vendor} blocked for user ${userId}: ${stamps.length} undeliverable messages within an hour`,
    );
    await this.journal?.recordProblem({
      projectId: context.projectId,
      env: 'dev',
      workflowId: `sandbox-${vendor}-${context.chatId ?? 'relay'}`,
      vendor,
      level: 'error',
      message: `The test bot is blocked for the project owner: ${SANDBOX_UNREACHABLE_PER_HOUR} messages within an hour could not be delivered (the bot was blocked or never started). An administrator can lift the block.`,
    });
    return true;
  }

  async block(vendor: string, userId: string, reason: string, projectId: string | null): Promise<void> {
    await this.blocks.createQueryBuilder().insert().values({ vendor, userId, reason, projectId }).orIgnore().execute();
    this.blockedCache.set(keyOf(vendor, userId), true);
  }

  async listBlocks(): Promise<ISandboxBlockRow[]> {
    const rows = await this.blocks.find({ order: { createdAt: 'DESC' } });
    return Promise.all(
      rows.map(async (row) => {
        const user = await this.users.findById(row.userId);
        return {
          id: row.id,
          vendor: row.vendor,
          userId: row.userId,
          username: user?.username ?? null,
          email: user?.email ?? null,
          reason: row.reason,
          projectId: row.projectId,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );
  }

  /** Lifts a block and forgets the account's counters, so the next error doesn't block it again at once. */
  async unblock(id: string): Promise<boolean> {
    const row = await this.blocks.findOneBy({ id });
    if (!row) return false;
    await this.blocks.delete({ id });
    const key = keyOf(row.vendor, row.userId);
    this.blockedCache.set(key, false);
    this.unreachable.delete(key);
    this.messages.delete(key);
    return true;
  }

  /** Drops empty windows; called from the relay's periodic sweep. */
  prune(): void {
    for (const window of [this.messages, this.unreachable]) {
      for (const key of window.keys()) {
        if (this.recent(window, key).length === 0) window.delete(key);
      }
    }
  }
}

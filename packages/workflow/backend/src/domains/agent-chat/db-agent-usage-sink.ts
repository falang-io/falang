import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';
import { AgentUsage } from './agent-usage.entity.js';
import type { IAgentUsageAfterCallContext, IAgentUsageSink } from './agent-usage-sink.js';

export interface IAgentUsageTotals {
  readonly calls: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

const USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Community-edition default `IAgentUsageSink`: records one `agent_usage` row per vendor call and
 * exposes the per-project totals behind `GET /projects/:id/agent/usage`. `beforeCall` is a no-op —
 * the community edition never refuses a call.
 */
@Injectable()
export class DbAgentUsageSink implements IAgentUsageSink {
  private readonly repository: Repository<AgentUsage>;

  constructor(@InjectRepository(AgentUsage) repository: Repository<AgentUsage>) {
    this.repository = repository;
  }

  beforeCall(): Promise<void> {
    return Promise.resolve();
  }

  async afterCall(ctx: IAgentUsageAfterCallContext): Promise<void> {
    await this.repository.save(
      this.repository.create({
        completionTokens: ctx.usage?.completionTokens ?? null,
        durationMs: Math.round(ctx.durationMs),
        model: ctx.model,
        projectId: ctx.projectId,
        promptTokens: ctx.usage?.promptTokens ?? null,
        totalTokens: ctx.usage?.totalTokens ?? null,
        userId: ctx.userId,
      }),
    );
  }

  /** Totals over the last 30 days for one project. */
  async getProjectTotals(projectId: string, now: Date = new Date()): Promise<IAgentUsageTotals> {
    const rows = await this.repository.find({
      where: { createdAt: MoreThanOrEqual(new Date(now.getTime() - USAGE_WINDOW_MS)), projectId },
    });
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    for (const row of rows) {
      promptTokens += row.promptTokens ?? 0;
      completionTokens += row.completionTokens ?? 0;
      totalTokens += row.totalTokens ?? 0;
    }
    return { calls: rows.length, completionTokens, promptTokens, totalTokens };
  }
}

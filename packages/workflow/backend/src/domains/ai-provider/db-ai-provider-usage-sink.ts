import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, type Repository } from 'typeorm';
import { AiProviderUsage } from './ai-provider-usage.entity.js';
import type { IAiProviderAfterCallContext, IAiProviderUsageSink } from './ai-provider-usage-sink.js';

export interface IAiProviderUsageTotals {
  readonly calls: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

const USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Community-edition default `IAiProviderUsageSink` (ADR 0081 (private)): one `ai_provider_usage` row per upstream call,
 * no checks — a self-hoster may share one key with their users without billing. `beforeCall` is a no-op.
 */
@Injectable()
export class DbAiProviderUsageSink implements IAiProviderUsageSink {
  private readonly repository: Repository<AiProviderUsage>;

  constructor(@InjectRepository(AiProviderUsage) repository: Repository<AiProviderUsage>) {
    this.repository = repository;
  }

  beforeCall(): Promise<void> {
    return Promise.resolve();
  }

  async afterCall(ctx: IAiProviderAfterCallContext): Promise<void> {
    await this.repository.save(
      this.repository.create({
        audioSeconds: ctx.usage?.audioSeconds ?? null,
        cachedPromptTokens: ctx.usage?.cachedPromptTokens ?? null,
        completionTokens: ctx.usage?.completionTokens ?? null,
        env: ctx.env,
        images: ctx.usage?.images ?? null,
        kind: ctx.kind,
        model: ctx.model,
        ownerId: ctx.ownerId,
        projectId: ctx.projectId,
        promptTokens: ctx.usage?.promptTokens ?? null,
        totalTokens: ctx.usage?.totalTokens ?? null,
      }),
    );
  }

  /** Totals over the last 30 days for one project (both environments). */
  async getProjectTotals(projectId: string, now: Date = new Date()): Promise<IAiProviderUsageTotals> {
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

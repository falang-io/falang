import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth/public.decorator.js';
import { METRICS_REGISTRY, PROMETHEUS_CONTENT_TYPE, type MetricsRegistry } from './metrics-registry.js';

/**
 * Prometheus scrape target (ADR 0060 (private)). No auth: it lives under `/internal/`, which
 * `portSplitMiddleware` serves only on the cluster-internal port, never through the public ingress.
 */
@Controller('internal/metrics')
export class MetricsController {
  private readonly registry: MetricsRegistry;

  constructor(@Inject(METRICS_REGISTRY) registry: MetricsRegistry) {
    this.registry = registry;
  }

  @Public()
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    const body = await this.registry.render();
    // Written raw: `res.send` would reorder the parameters (`charset` before `version`).
    res.setHeader('Content-Type', PROMETHEUS_CONTENT_TYPE);
    res.end(body);
  }
}

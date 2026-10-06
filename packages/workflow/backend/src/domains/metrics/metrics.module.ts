import { Global, Module } from '@nestjs/common';
import './metrics.js';
import { MetricsController } from './metrics.controller.js';
import { METRICS_REGISTRY, metricsRegistry } from './metrics-registry.js';
import { registerProcessMetrics } from './process-metrics.js';

let processMetricsRegistered = false;

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: METRICS_REGISTRY,
      useFactory: () => {
        if (!processMetricsRegistered) {
          processMetricsRegistered = true;
          registerProcessMetrics(metricsRegistry);
        }
        return metricsRegistry;
      },
    },
  ],
  exports: [METRICS_REGISTRY],
})
export class MetricsModule {}

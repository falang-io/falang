import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { MetricsRegistry } from './metrics-registry.js';

const NS = 1e9;

const gauge = (name: string, help: string, value: number): string =>
  `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${Number.isFinite(value) ? value : 0}\n`;
const counter = (name: string, help: string, value: number): string =>
  `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;

/** Standard process/Node.js metrics under prom-client's names (ADR 0060 (private)), rendered fresh on every scrape. */
export const registerProcessMetrics = (registry: MetricsRegistry): void => {
  const startTimeSeconds = Math.round(Date.now() / 1000 - process.uptime());
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();

  registry.custom({
    name: 'process_and_nodejs',
    render: () => {
      const cpu = process.cpuUsage();
      const user = cpu.user / 1e6;
      const system = cpu.system / 1e6;
      const memory = process.memoryUsage();
      const lagP50 = delay.count > 0 ? delay.percentile(50) / NS : 0;
      const lagP99 = delay.count > 0 ? delay.percentile(99) / NS : 0;
      const lagMax = delay.count > 0 ? delay.max / NS : 0;
      delay.reset();
      const handles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.().length;
      return [
        counter('process_cpu_user_seconds_total', 'Total user CPU time spent in seconds.', user),
        counter('process_cpu_system_seconds_total', 'Total system CPU time spent in seconds.', system),
        counter('process_cpu_seconds_total', 'Total user and system CPU time spent in seconds.', user + system),
        gauge('process_resident_memory_bytes', 'Resident memory size in bytes.', memory.rss),
        gauge('process_start_time_seconds', 'Start time of the process since unix epoch in seconds.', startTimeSeconds),
        gauge('nodejs_heap_size_used_bytes', 'Process heap size used from Node.js in bytes.', memory.heapUsed),
        gauge('nodejs_heap_size_total_bytes', 'Process heap size from Node.js in bytes.', memory.heapTotal),
        gauge('nodejs_external_memory_bytes', 'Node.js external memory size in bytes.', memory.external),
        gauge(
          'nodejs_eventloop_lag_p50_seconds',
          'The 50th percentile of event loop delay since the last scrape.',
          lagP50,
        ),
        gauge(
          'nodejs_eventloop_lag_p99_seconds',
          'The 99th percentile of event loop delay since the last scrape.',
          lagP99,
        ),
        gauge('nodejs_eventloop_lag_max_seconds', 'The maximum event loop delay since the last scrape.', lagMax),
        ...(typeof handles === 'number'
          ? [gauge('nodejs_active_handles_total', 'Number of active handles.', handles)]
          : []),
      ].join('');
    },
  });
};

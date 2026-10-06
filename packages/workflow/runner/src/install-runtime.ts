import { DefaultLogger, Runtime, type LogEntry, type RuntimeOptions } from '@temporalio/worker';
import { formatJsonLogLine, isJsonLogFormat } from './log.js';

/**
 * Prometheus metrics of the Temporal SDK (ADR 0060 (private)) — `RUNNER_METRICS_PORT` set => `0.0.0.0:<port>/metrics`.
 * `useSecondsForDurations` makes every latency histogram seconds-based (`unitSuffix` stays off: no `_seconds` in the
 * name, the unit is implied). `countersTotalSuffix: true` is requested but the bundled Core (SDK 1.19) does NOT apply
 * it — counters are exposed without `_total` (checked against a real Worker + `temporal server start-dev`).
 * Series seen on `/metrics` after one workflow with one activity (all prefixed `temporal_`; histograms expose
 * `_bucket`/`_sum`/`_count`): `workflow_task_execution_latency`, `workflow_task_replay_latency`,
 * `workflow_endtoend_latency`, `workflow_task_schedule_to_start_latency`, `activity_execution_latency`,
 * `activity_schedule_to_start_latency`, `activity_succeed_endtoend_latency`, `activity_task_received`,
 * `workflow_completed`, `sticky_cache_hit`, `sticky_cache_size`, `num_pollers`, `worker_task_slots_available`,
 * `worker_task_slots_used`, `request`, `request_latency`, `long_request`, `workflow_task_queue_poll_succeed`.
 * Appear only once the event happens (not verified live): `activity_execution_failed`, `workflow_failed`,
 * `workflow_task_execution_failed`, `sticky_cache_miss`, `activity_task_error`.
 */
export const buildRuntimeOptions = (env: NodeJS.ProcessEnv = process.env): RuntimeOptions | null => {
  const port = Number(env.RUNNER_METRICS_PORT);
  const metrics = Number.isInteger(port) && port > 0;
  const json = isJsonLogFormat(env);
  if (!metrics && !json) return null;
  const options: RuntimeOptions = {};
  if (json) {
    options.logger = new DefaultLogger('INFO', (entry: LogEntry) => {
      const time = new Date(Number(entry.timestampNanos / 1_000_000n));
      process.stderr.write(`${formatJsonLogLine(entry.level, entry.message, entry.meta, time)}\n`);
    });
  }
  if (metrics) {
    options.telemetryOptions = {
      metrics: {
        prometheus: { bindAddress: `0.0.0.0:${port}`, countersTotalSuffix: true, useSecondsForDurations: true },
      },
    };
  }
  return options;
};

let installed = false;

/** Must run before any `NativeConnection`/`Worker`; `Runtime.install` works once per process, later calls are no-ops. No env set => nothing is installed. */
export const installRunnerRuntime = (env: NodeJS.ProcessEnv = process.env): boolean => {
  if (installed) return false;
  const options = buildRuntimeOptions(env);
  if (!options) return false;
  Runtime.install(options);
  installed = true;
  return true;
};

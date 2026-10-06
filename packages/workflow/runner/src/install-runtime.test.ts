import { Runtime } from '@temporalio/worker';
import { afterAll, describe, expect, it } from 'vitest';
import { buildRuntimeOptions, installRunnerRuntime } from './install-runtime.js';
import { formatJsonLogLine } from './log.js';

describe('buildRuntimeOptions', () => {
  it('returns null without env', () => {
    expect(buildRuntimeOptions({})).toBeNull();
    expect(installRunnerRuntime({})).toBe(false);
  });
  it('configures prometheus', () => {
    const o = buildRuntimeOptions({ RUNNER_METRICS_PORT: '9464' });
    expect(o?.telemetryOptions?.metrics).toEqual({
      prometheus: { bindAddress: '0.0.0.0:9464', countersTotalSuffix: true, useSecondsForDurations: true },
    });
    expect(o?.logger).toBeUndefined();
  });
  it('configures json logger', () => {
    expect(buildRuntimeOptions({ LOG_FORMAT: 'json' })?.logger).toBeDefined();
  });
});

describe('formatJsonLogLine', () => {
  it('writes one json object', () => {
    const line = formatJsonLogLine('ERROR', 'boom', { sdkComponent: 'worker', message: 'x' }, new Date(0));
    expect(JSON.parse(line)).toEqual({
      sdkComponent: 'worker',
      time: '1970-01-01T00:00:00.000Z',
      level: 'error',
      message: 'boom',
    });
    expect(line).not.toContain('\n');
  });
});

describe('real Runtime metrics', () => {
  afterAll(async () => {
    await Runtime.instance().shutdown();
  });
  it('exposes /metrics', async () => {
    const port = 19_464;
    expect(installRunnerRuntime({ RUNNER_METRICS_PORT: String(port) })).toBe(true);
    expect(installRunnerRuntime({ RUNNER_METRICS_PORT: String(port) })).toBe(false);
    const rt = Runtime.instance();
    const counter = rt.metricMeter.createCounter('probe_counter', 'x');
    counter.add(1);
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('probe_counter 1');
  });
});

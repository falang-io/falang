import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from './metrics-registry.js';

describe('MetricsRegistry', () => {
  it('renders a counter with HELP/TYPE and labels (sorted keys)', async () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter('things_total', 'Things.');
    counter.inc({ b: '2', a: '1' });
    counter.inc({ a: '1', b: '2' }, 2);
    counter.inc();
    expect(await registry.render()).toBe(
      '# HELP things_total Things.\n# TYPE things_total counter\nthings_total{a="1",b="2"} 3\nthings_total 1\n',
    );
  });

  it('ignores negative counter increments', async () => {
    const registry = new MetricsRegistry();
    registry.counter('c_total', 'c').inc({}, -1);
    expect(await registry.render()).toBe('# HELP c_total c\n# TYPE c_total counter\n');
  });

  it('escapes backslash, quote and newline in label values and newline in help', async () => {
    const registry = new MetricsRegistry();
    registry.counter('e_total', 'line1\nline2 \\').inc({ v: 'a"b\\c\nd' });
    expect(await registry.render()).toBe(
      '# HELP e_total line1\\nline2 \\\\\n# TYPE e_total counter\ne_total{v="a\\"b\\\\c\\nd"} 1\n',
    );
  });

  it('runs a gauge collector on every render and keeps old values if it throws', async () => {
    const registry = new MetricsRegistry();
    let calls = 0;
    const gauge = registry.gauge('g', 'g', (g) => {
      calls += 1;
      if (calls === 2) throw new Error('boom');
      g.set({ env: 'dev' }, calls);
    });
    expect(await registry.render()).toContain('g{env="dev"} 1\n');
    expect(await registry.render()).toContain('g{env="dev"} 1\n');
    expect(calls).toBe(2);
    gauge.set(5);
    expect(await registry.render()).toContain('g 5\n');
  });

  it('renders a histogram with cumulative buckets, +Inf, sum and count', async () => {
    const registry = new MetricsRegistry();
    const histogram = registry.histogram('d_seconds', 'D.', [0.1, 1]);
    histogram.observe({ route: '/x' }, 0.05);
    histogram.observe({ route: '/x' }, 0.5);
    histogram.observe({ route: '/x' }, 5);
    expect(await registry.render()).toBe(
      [
        '# HELP d_seconds D.',
        '# TYPE d_seconds histogram',
        'd_seconds_bucket{le="0.1",route="/x"} 1',
        'd_seconds_bucket{le="1",route="/x"} 2',
        'd_seconds_bucket{le="+Inf",route="/x"} 3',
        'd_seconds_sum{route="/x"} 5.55',
        'd_seconds_count{route="/x"} 3',
        '',
      ].join('\n'),
    );
  });

  it('returns the existing metric when the same name is registered twice', () => {
    const registry = new MetricsRegistry();
    expect(registry.counter('x_total', 'x')).toBe(registry.counter('x_total', 'x'));
  });
});

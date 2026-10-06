// oxlint-disable max-classes-per-file -- one small class per Prometheus metric type, kept together.
/**
 * A minimal Prometheus registry (text exposition format 0.0.4) — Counter, Gauge (with an optional
 * scrape-time `collect()` callback) and Histogram, all with labels. Deliberately dependency-free
 * (ADR 0060 (private)): one registry per process, reachable from DI and from plain module code.
 * Never put high-cardinality values (project/user ids) in labels.
 */

export type TLabels = Readonly<Record<string, string>>;

const BACKSLASH = String.fromCodePoint(92);
const DOUBLE_BACKSLASH = BACKSLASH.repeat(2);
const ESCAPED_NEWLINE = `${BACKSLASH}n`;
const ESCAPED_QUOTE = `${BACKSLASH}"`;

const escapeLabelValue = (value: string): string =>
  value.replaceAll(BACKSLASH, DOUBLE_BACKSLASH).replaceAll('\n', ESCAPED_NEWLINE).replaceAll('"', ESCAPED_QUOTE);

const escapeHelp = (value: string): string =>
  value.replaceAll(BACKSLASH, DOUBLE_BACKSLASH).replaceAll('\n', ESCAPED_NEWLINE);

/** `{a="1",b="2"}` (keys sorted, so equal label sets always yield one series), or `''` without labels. */
const renderLabels = (labels: TLabels, extra?: TLabels): string => {
  const merged = { ...labels, ...extra };
  const keys = Object.keys(merged).toSorted();
  if (keys.length === 0) return '';
  return `{${keys.map((key) => `${key}="${escapeLabelValue(merged[key] ?? '')}"`).join(',')}}`;
};

const labelKey = (labels: TLabels): string => renderLabels(labels);

const formatNumber = (value: number): string => {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Inf';
  if (value === Number.NEGATIVE_INFINITY) return '-Inf';
  return String(value);
};

export interface IMetric {
  readonly name: string;
  render(): Promise<string> | string;
}

abstract class Metric implements IMetric {
  readonly name: string;
  protected readonly help: string;
  private readonly type: 'counter' | 'gauge' | 'histogram';

  constructor(name: string, help: string, type: 'counter' | 'gauge' | 'histogram') {
    this.name = name;
    this.help = help;
    this.type = type;
  }

  protected header(): string {
    return `# HELP ${this.name} ${escapeHelp(this.help)}\n# TYPE ${this.name} ${this.type}\n`;
  }

  abstract render(): Promise<string> | string;
}

export class Counter extends Metric {
  private readonly series = new Map<string, { labels: TLabels; value: number }>();

  constructor(name: string, help: string) {
    super(name, help, 'counter');
  }

  inc(labels: TLabels = {}, by = 1): void {
    if (by < 0) return;
    const key = labelKey(labels);
    const entry = this.series.get(key);
    if (entry) entry.value += by;
    else this.series.set(key, { labels: { ...labels }, value: by });
  }

  render(): string {
    let out = this.header();
    for (const { labels, value } of this.series.values()) {
      out += `${this.name}${renderLabels(labels)} ${formatNumber(value)}\n`;
    }
    return out;
  }
}

/** Called on every scrape; sets values through the gauge it was registered on. */
export type IGaugeCollector = (gauge: Gauge) => Promise<void> | void;

export class Gauge extends Metric {
  private readonly series = new Map<string, { labels: TLabels; value: number }>();

  private collector: IGaugeCollector | undefined;

  constructor(name: string, help: string, collector?: IGaugeCollector) {
    super(name, help, 'gauge');
    this.collector = collector;
  }

  /** Sets (or replaces) the scrape-time callback — for gauges declared before the data source exists. */
  onCollect(collector: IGaugeCollector): void {
    this.collector = collector;
  }

  set(labels: TLabels, value: number): void;
  set(value: number): void;
  set(first: TLabels | number, second?: number): void {
    const labels = typeof first === 'number' ? {} : first;
    const value = typeof first === 'number' ? first : (second ?? 0);
    this.series.set(labelKey(labels), { labels: { ...labels }, value });
  }

  inc(labels: TLabels = {}, by = 1): void {
    const key = labelKey(labels);
    const entry = this.series.get(key);
    if (entry) entry.value += by;
    else this.series.set(key, { labels: { ...labels }, value: by });
  }

  dec(labels: TLabels = {}, by = 1): void {
    this.inc(labels, -by);
  }

  reset(): void {
    this.series.clear();
  }

  async render(): Promise<string> {
    if (this.collector) {
      try {
        await this.collector(this);
      } catch {
        // a failing collector keeps the previous values rather than failing the whole scrape
      }
    }
    let out = this.header();
    for (const { labels, value } of this.series.values()) {
      out += `${this.name}${renderLabels(labels)} ${formatNumber(value)}\n`;
    }
    return out;
  }
}

interface IHistogramSeries {
  labels: TLabels;
  counts: number[];
  sum: number;
  count: number;
}

export class Histogram extends Metric {
  private readonly series = new Map<string, IHistogramSeries>();
  private readonly buckets: readonly number[];

  constructor(name: string, help: string, buckets: readonly number[]) {
    super(name, help, 'histogram');
    this.buckets = buckets.toSorted((a, b) => a - b);
  }

  observe(labels: TLabels, value: number): void {
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels: { ...labels }, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= (this.buckets[i] ?? Number.POSITIVE_INFINITY)) entry.counts[i] = (entry.counts[i] ?? 0) + 1;
    }
  }

  /** Starts a timer; the returned function observes the elapsed seconds. */
  startTimer(labels: TLabels = {}): () => number {
    const startedAt = process.hrtime.bigint();
    return () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.observe(labels, seconds);
      return seconds;
    };
  }

  render(): string {
    let out = this.header();
    for (const { labels, counts, sum, count } of this.series.values()) {
      for (let index = 0; index < this.buckets.length; index += 1) {
        const upper = this.buckets[index] ?? Number.POSITIVE_INFINITY;
        out += `${this.name}_bucket${renderLabels(labels, { le: formatNumber(upper) })} ${counts[index] ?? 0}\n`;
      }
      out += `${this.name}_bucket${renderLabels(labels, { le: '+Inf' })} ${count}\n`;
      out += `${this.name}_sum${renderLabels(labels)} ${formatNumber(sum)}\n`;
      out += `${this.name}_count${renderLabels(labels)} ${count}\n`;
    }
    return out;
  }
}

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export class MetricsRegistry {
  private readonly metrics = new Map<string, IMetric>();

  private register<T extends IMetric>(metric: T): T {
    const existing = this.metrics.get(metric.name);
    if (existing) return existing as T;
    this.metrics.set(metric.name, metric);
    return metric;
  }

  counter(name: string, help: string): Counter {
    return this.register(new Counter(name, help));
  }

  gauge(name: string, help: string, collector?: IGaugeCollector): Gauge {
    return this.register(new Gauge(name, help, collector));
  }

  histogram(name: string, help: string, buckets: readonly number[]): Histogram {
    return this.register(new Histogram(name, help, buckets));
  }

  /** A metric with a fully custom `render()` (process metrics). */
  custom(metric: IMetric): void {
    this.register(metric);
  }

  async render(): Promise<string> {
    const parts = await Promise.all([...this.metrics.values()].map((metric) => metric.render()));
    return parts.join('');
  }
}

/** The one registry of this process. */
export const metricsRegistry = new MetricsRegistry();

/** Nest DI token for the process registry. */
export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');

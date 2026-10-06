import { metricsRegistry } from './metrics-registry.js';

/** Every application metric of the backend (ADR 0060 (private)); names are a contract with the Grafana dashboards. */
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const BUILD_BUCKETS = [1, 2, 5, 10, 20, 30, 60, 120, 300];
const AGENT_BUCKETS = [0.5, 1, 2, 5, 10, 20, 30, 60, 120];

export const httpRequestsTotal = metricsRegistry.counter(
  'falang_http_requests_total',
  'HTTP requests handled, by method, route template and status.',
);
export const httpRequestDuration = metricsRegistry.histogram(
  'falang_http_request_duration_seconds',
  'HTTP request duration, by method and route template.',
  HTTP_BUCKETS,
);
export const buildsTotal = metricsRegistry.counter('falang_builds_total', 'Project builds by result.');
export const buildDuration = metricsRegistry.histogram(
  'falang_build_duration_seconds',
  'Build duration (type-check + bundle) in seconds.',
  BUILD_BUCKETS,
);
export const buildWorkerQueueLength = metricsRegistry.gauge(
  'falang_build_worker_queue_length',
  'Builds waiting for a free build-worker slot.',
);
export const buildWorkersActive = metricsRegistry.gauge(
  'falang_build_workers_active',
  'Build-worker processes running right now.',
);
export const runnerPods = metricsRegistry.gauge('falang_runner_pods', 'Runner Deployments by environment.');
export const agentChatCallsTotal = metricsRegistry.counter(
  'falang_agent_chat_calls_total',
  'In-app agent chat calls by result.',
);
export const agentChatTokensTotal = metricsRegistry.counter(
  'falang_agent_chat_tokens_total',
  'Tokens spent by the in-app agent, by kind.',
);
export const agentChatDuration = metricsRegistry.histogram(
  'falang_agent_chat_duration_seconds',
  'Duration of the vendor call behind one agent chat request.',
  AGENT_BUCKETS,
);
export const signupsTotal = metricsRegistry.counter('falang_signups_total', 'Self-service signups by signup mode.');
export const emailVerificationsTotal = metricsRegistry.counter(
  'falang_email_verifications_total',
  'E-mail addresses confirmed.',
);
export const activationsTotal = metricsRegistry.counter(
  'falang_activations_total',
  'Accounts activated by an administrator.',
);
export const mailTotal = metricsRegistry.counter('falang_mail_total', 'Outgoing mail by result.');
export const temporalPermissionDeniedTotal = metricsRegistry.counter(
  'falang_temporal_permission_denied_total',
  'Temporal PERMISSION_DENIED / UNAUTHENTICATED answers.',
);

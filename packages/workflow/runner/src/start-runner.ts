import { Worker, type WorkerOptions } from '@temporalio/worker';
import {
  createEgressConfigPoller,
  createInternalOriginMatcher,
  fetchEgressProxyConfig,
  installEgressRouting,
  type IEgressConfigPoller,
} from '@falang/workflow-egress';
import { installRunnerRuntime } from './install-runtime.js';
import { fetchArtifact } from './fetch-artifact.js';
import { loadCjsModuleFromSource } from './load-cjs-module-from-source.js';
import type { IRunnerConfig } from './runner-config.js';
import { connectRunnerToTemporal } from './temporal-connection.js';
import { envFromTaskQueue, JournalBuffer } from './journal-buffer.js';
import { buildJournalWorkerOptions } from './journal-sink.js';
import { buildRunnerActivities } from './runner-activities.js';

const EGRESS_CONFIG_READY_TIMEOUT_MS = 5000;
const JOURNAL_SHUTDOWN_FLUSH_MS = 5000;

/**
 * Starts a Temporal Worker for a single compiled workflow. Per
 * ADR 0002 (private), one runner pod backs exactly one workflow
 * definition/version on its own task queue — there is no multi-tenant loading or hot-reload here.
 * Resolves once the worker shuts down (e.g. on SIGINT/SIGTERM) or its poll loop errors out.
 *
 * The artifact is fetched over HTTP and loaded entirely in memory — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod": this
 * pod's filesystem is never written to (its Pod spec sets `readOnlyRootFilesystem: true`), unlike
 * the pre-k8s version of this function, which read `workflowsPath`/`activitiesPath` off local disk.
 */
export const startRunner = async (config: IRunnerConfig): Promise<void> => {
  // Metrics/JSON logs of the SDK (ADR 0060 (private)); has to precede every connection/Worker.
  installRunnerRuntime();
  // Tokenless in `shared` mode, otherwise authenticated for this project's namespace only and kept fresh — see `temporal-connection.ts`.
  const temporal = await connectRunnerToTemporal(config);

  const { workflowBundle, activitiesSource } = await fetchArtifact({
    artifactBaseUrl: config.artifactBaseUrl,
    projectId: config.projectId,
    internalProjectToken: config.internalProjectToken,
    buildId: config.buildId,
  });
  // Filename only needs to be a plausible absolute path inside this image's own node_modules
  // resolution tree — never actually read from disk — so `require('@temporalio/activity')` inside
  // the loaded activities resolves against the runner image's pre-baked `node_modules`.
  // Run journal (ADR 0059): only when backend's URL is known, like egress routing.
  const journal = config.backendUrl
    ? new JournalBuffer({
        backendUrl: config.backendUrl,
        projectId: config.projectId,
        projectToken: config.internalProjectToken,
        env: envFromTaskQueue(config.taskQueue),
        buildId: config.buildId ?? null,
        // oxlint-disable-next-line no-console
        onError: (message, error) => console.warn(message, error),
      })
    : null;
  const activities = buildRunnerActivities(
    loadCjsModuleFromSource(activitiesSource, '/app/activities.js') as object,
    journal,
  );

  const workerOptions: WorkerOptions = {
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowBundle: { code: workflowBundle },
    activities,
    ...(journal ? buildJournalWorkerOptions(journal) : {}),
  };
  if (temporal) {
    workerOptions.connection = temporal.connection;
  }
  if (config.deploymentName && config.buildId) {
    // PINNED (not AUTO_UPGRADE): an execution stays on the version it started on for its whole
    // lifetime — only new workflow starts follow whichever version is "current". See
    // ADR 0004 (private) for why AUTO_UPGRADE was rejected.
    workerOptions.workerDeploymentOptions = {
      version: { deploymentName: config.deploymentName, buildId: config.buildId },
      useWorkerVersioning: true,
      defaultVersioningBehavior: 'PINNED',
    };
  }

  // Vendor egress routing (ADR 0056 (private)): skipped when backend's URL is unknown (local tests).
  let poller: IEgressConfigPoller | null = null;
  let routing: { dispose(): void } | null = null;
  if (config.backendUrl) {
    const backendUrl = config.backendUrl;
    poller = createEgressConfigPoller({
      load: () =>
        fetchEgressProxyConfig({
          backendUrl,
          projectId: config.projectId,
          projectToken: config.internalProjectToken,
        }),
    });
    let timer: NodeJS.Timeout | null = null;
    await Promise.race([
      poller.ready,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, EGRESS_CONFIG_READY_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    routing = installEgressRouting({
      getConfig: poller.get,
      isInternal: createInternalOriginMatcher([
        config.backendUrl,
        config.artifactBaseUrl,
        ...(config.internalServiceUrls ?? []),
      ]),
    });
  }

  try {
    const worker = await Worker.create(workerOptions);
    await worker.run();
  } finally {
    if (journal) {
      // The Worker has shut down gracefully by now; deliver what is still queued before the process exits.
      await journal.flush(JOURNAL_SHUTDOWN_FLUSH_MS);
      journal.dispose();
    }
    routing?.dispose();
    poller?.dispose();
    await temporal?.close();
  }
};

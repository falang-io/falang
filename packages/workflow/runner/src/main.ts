// oxlint-disable no-console
import v8 from 'node:v8';
import { pushCoverage } from './push-coverage.js';
import { readRunnerConfigFromEnv } from './runner-config.js';
import { startRunner } from './start-runner.js';

const runnerConfig = readRunnerConfigFromEnv();

// Only meaningful when `NODE_V8_COVERAGE` is set — no behavior change otherwise (Temporal's own
// `Runtime` already registers its own `SIGTERM` handler unconditionally, see
// `flushAndPushCoverage`'s doc comment, so a normal pod's shutdown is unaffected either way). A
// no-op listener, but not a no-op line: registering *any* `SIGTERM` listener is what stops Node
// from applying its default action (terminate immediately) on that signal — live-verified that
// without one, this process dies on `SIGTERM` before `flushAndPushCoverage` below gets a chance to
// run at all.
if (process.env.NODE_V8_COVERAGE) {
  // oxlint-disable-next-line no-empty-function -- the empty body is the point, see the comment above.
  process.on('SIGTERM', () => {});
}

/**
 * Pushes this process's own `NODE_V8_COVERAGE` output to `backend` (see
 * ADR 0012 (private) and ADR 0016 (private)'s "Runner-pod coverage collection" implementation notes) after
 * `startRunner()` settles — not from a raw `process.on('SIGTERM', ...)` handler. `@temporalio/worker`'s own `Runtime`
 * installs its own `SIGTERM` handler (`runtime.js`'s `startShutdownSequence`) to gracefully stop the Worker;
 * live-verified on a real `kind` pod that a second, independent `SIGTERM` handler here loses that race — Temporal's own
 * shutdown reaches this process before an unrelated handler's async `fetch` can complete, silently dropping the
 * coverage push. Chaining onto `startRunner()`'s own promise instead only runs this once the Worker (and the graceful
 * shutdown `SIGTERM` itself triggered) has already fully settled, so there's nothing left to race.
 */
const flushAndPushCoverage = async (): Promise<void> => {
  if (!process.env.NODE_V8_COVERAGE) return;
  v8.takeCoverage();
  try {
    await pushCoverage({
      coverageDir: process.env.NODE_V8_COVERAGE,
      artifactBaseUrl: runnerConfig.artifactBaseUrl,
      projectId: runnerConfig.projectId,
      internalProjectToken: runnerConfig.internalProjectToken,
    });
  } catch (error) {
    console.error('Workflow runner failed to push coverage on shutdown:', error);
  }
};

/** Process entry point: one runner process per workflow definition/version (see ADR 0002 (private)). */
startRunner(runnerConfig)
  .catch((error: unknown) => {
    console.error('Workflow runner exited with an error:', error);
    process.exitCode = 1;
  })
  .finally(flushAndPushCoverage);

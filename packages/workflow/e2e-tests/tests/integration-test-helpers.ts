/** Reachable from this test process itself (runs on the compose network) — use for direct calls to the mock's fixture routes (`queueOpenAiResponse`, `getTelegramCalls`, …), never for a URL embedded into workflow-node/credential data (see `RUNNER_MOCKS_URL`). */
export const MOCKS_URL = process.env.MOCKS_URL ?? 'http://localhost:4100';
/** Reachable from *inside* a runner pod, not this test process — use whenever a mocks URL is embedded into workflow-node/credential data that a pod's compiled activity fetches at execution time (an HTTP Request node's `url`, an OpenAI credential's `baseUrl`), same reachability requirement as `RunnerProcessManager`'s own `RUNNER_*` overrides. */
export const RUNNER_MOCKS_URL = process.env.RUNNER_MOCKS_URL ?? MOCKS_URL;

export const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * `IntegrationsRuntimeService` only discovers a newly-seeded credential (and only once its
 * project's dev runner is running) on its own ~30s tick — this polls rather than fights that.
 * `check` should return a truthy value once the condition holds (never legitimately `undefined`
 * for these tests' use — every value polled for here is an object/array).
 */
export const waitForCondition = async <T>(
  check: () => Promise<T | undefined>,
  timeoutMs: number,
  intervalMs = 2000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    await delay(intervalMs);
  }
};

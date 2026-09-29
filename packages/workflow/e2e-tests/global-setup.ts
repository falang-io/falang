// oxlint-disable no-console
import MCR from 'monocart-coverage-reports';
import coverageOptions from './mcr.config.e2e-browser.js';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForResponse = async (url: string, deadline: number): Promise<void> => {
  try {
    await fetch(url);
  } catch {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${url} to respond`);
    await delay(POLL_INTERVAL_MS);
    await waitForResponse(url, deadline);
  }
};

/**
 * Defense-in-depth on top of `docker-compose.workflow-e2e.yml`'s healthchecks: also works when
 * this suite is run locally (`npm test`) against a dev stack that's still mid-startup.
 */
export default async function globalSetup(): Promise<void> {
  // See ADR 0012 (private) and `tests/fixtures.ts`'s `collectCoverage`
  // fixture. Clears any coverage cache left behind by a previous run before this one starts adding
  // to it.
  if (process.env.COLLECT_COVERAGE === 'true') {
    MCR(coverageOptions).cleanCache();
  }
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5175';
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000';
  const mocksUrl = process.env.MOCKS_URL ?? 'http://localhost:4100';
  console.log(`Waiting for client (${clientUrl}), backend (${backendUrl}), and mocks (${mocksUrl})…`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  await Promise.all([
    waitForResponse(clientUrl, deadline),
    waitForResponse(`${backendUrl}/auth/me`, deadline),
    waitForResponse(mocksUrl, deadline),
  ]);
}

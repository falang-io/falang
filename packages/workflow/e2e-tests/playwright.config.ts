import { defineConfig, devices } from '@playwright/test';

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5175';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Every spec's dev-runner build/spawn (see fixtures.ts's `startDevRunnerViaUI`) goes through the
  // one shared `backend` container's single-threaded Node event loop (webpack-bundling the
  // workflow, then spawning the runner process) — confirmed serialized in practice (~20s between
  // successive builds' "Worker state changed: RUNNING" log lines, however many run "concurrently").
  // Any worker count > 1 lets several specs' builds queue up behind each other, which was seen to
  // push `waitForDevRunnerStatus`'s poll well past even a 60s budget. Forced fully serial in CI
  // rather than chasing a larger timeout for a bottleneck that's structural, not a matter of
  // waiting longer; local runs (already lower default parallelism, usually one spec at a time)
  // keep the default.
  ...(process.env.CI ? { workers: 1 } : {}),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

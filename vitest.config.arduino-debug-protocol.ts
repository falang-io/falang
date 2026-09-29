import { defineConfig } from 'vitest/config';

/**
 * Dedicated config for `*.docker-e2e-spec.ts` files — the same "give the file a suffix Vitest's
 * default `include` glob (`**\/*.{test,spec}.?(c|m)[jt]s?(x)`) doesn't match, so a plain `npm test`
 * never picks it up" trick `vitest.config.workflow-e2e.ts` uses (see that file's own comment). Needed
 * for `falang-debug-header.docker-e2e-spec.ts` (ADR 0021 (private) §Phase 2): it shells out to
 * `docker` to compile and run `falang_debug.h` for the host and drive its real wire protocol over
 * stdio — the no-hardware half of that phase's verification plan, requiring a working Docker daemon
 * the same way `@falang/logic-e2e-tests`'s own specs do (see ADR 0019 (private)), so it's excluded
 * from the fast local-check path the same way.
 */
export default defineConfig({
  test: {
    include: ['packages/*/*/src/**/*.docker-e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
  },
});

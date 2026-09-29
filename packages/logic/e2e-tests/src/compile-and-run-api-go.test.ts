import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import { API_PROJECT_DOCUMENTS } from './api-project.fixture.js';
import { GO_API_DRIVER } from './api-drivers/api-driver.go.js';
import { runGoProjectInDocker } from './run-go-project.js';
import { API_EXPECTED_RESULT_LINES } from './expected-output.js';

const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('call-api project on the Go target (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level Go compiler's first call-api project and reproduces the old app's result.txt, driven by a hand-written API implementation, via the Docker build&run harness",
    async () => {
      // No `entryDocumentId` — same reasoning as the cpp version, see `GO_API_DRIVER`'s own top comment.
      const code = compileGoProject({ documents: API_PROJECT_DOCUMENTS });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-api-go-'));
      try {
        await writeFile(join(dir, 'main.go'), `${code}\n\n${GO_API_DRIVER}`);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, API_EXPECTED_RESULT_LINES.length)).toEqual(API_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

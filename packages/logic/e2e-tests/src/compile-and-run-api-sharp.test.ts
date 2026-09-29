import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import { API_PROJECT_DOCUMENTS } from './api-project.fixture.js';
import { SHARP_API_DRIVER } from './api-drivers/api-driver.sharp.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';
import { API_EXPECTED_RESULT_LINES } from './expected-output.js';

const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('call-api project on the C# target (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level C# compiler's first call-api project and reproduces the old app's result.txt, driven by a hand-written API implementation, via the Docker build&run harness",
    async () => {
      // No `entryDocumentId` — same reasoning as the cpp/Go/Rust versions, see `SHARP_API_DRIVER`'s own top comment.
      const code = compileSharpProject({ documents: API_PROJECT_DOCUMENTS });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-api-sharp-'));
      try {
        await writeSharpProjectFiles(dir, `${code}\n\n${SHARP_API_DRIVER}`);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, API_EXPECTED_RESULT_LINES.length)).toEqual(API_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

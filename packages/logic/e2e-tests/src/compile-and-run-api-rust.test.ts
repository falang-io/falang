import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRustProject } from '@falang/logic-constructor';
import { API_PROJECT_DOCUMENTS } from './api-project.fixture.js';
import { RUST_API_DRIVER } from './api-drivers/api-driver.rust.js';
import { runRustProjectInDocker, writeRustFalangProjectFiles } from './run-rust-project.js';
import { API_EXPECTED_RESULT_LINES } from './expected-output.js';

const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('call-api project on the Rust target (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level Rust compiler's first call-api project and reproduces the old app's result.txt, driven by a hand-written API implementation, via the Docker build&run harness",
    async () => {
      // No `entryDocumentId` — the driver's own `fn main()` calls `falang::runApiTests::runApiTests(&mut
      // apis)` directly by its real document name, see `RUST_API_DRIVER`'s own top comment.
      const compiled = compileRustProject({ documents: API_PROJECT_DOCUMENTS });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-api-rust-'));
      try {
        await writeRustFalangProjectFiles(dir, compiled, RUST_API_DRIVER);
        const lines = await runRustProjectInDocker(dir);
        expect(lines.slice(0, API_EXPECTED_RESULT_LINES.length)).toEqual(API_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

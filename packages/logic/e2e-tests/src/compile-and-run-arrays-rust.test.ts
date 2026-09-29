import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRustProject } from '@falang/logic-constructor';
import { ARRAYS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './arrays-project.fixture.js';
import { buildNoApiRustDriver, runRustProjectInDocker, writeRustFalangProjectFiles } from './run-rust-project.js';
import { ARRAYS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Reuses the shared `arrays-project.fixture.ts` directly, same reasoning as
 * `compile-and-run-conditions-rust.test.ts` — no numeric-type mixing anywhere in this project, so no
 * `*-rust.fixture.ts` fork is needed. This is the load-bearing exercise of ADR 0019 (private)'s
 * "Rust target — old-app layout" `&`-reference call-site contract (`rust-leaf-emitters.ts`'s own doc
 * comment on `toRustArgValue`): `RunFunctions` passes its own `x` into five sequential `call-function`s
 * and then indexes it again afterward — `x` is passed as `&x` at every call site (a borrow, never
 * moved), so it stays usable afterward without needing a `.clone()` at all.
 */

const TEST_TITLE =
  "compiles arr-push/arr-pop/arr-shift/arr-unshift/foreach/from-to-cycle/struct-array and reproduces the old app's result.txt via the Docker build&run harness";

const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays project on the Rust target (ADR 0019 (private))', () => {
  it(
    TEST_TITLE,
    async () => {
      const compiled = compileRustProject({ documents: ARRAYS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-rust-'));
      try {
        await writeRustFalangProjectFiles(dir, compiled, buildNoApiRustDriver());
        const lines = await runRustProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_EXPECTED_RESULT_LINES.length)).toEqual(ARRAYS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

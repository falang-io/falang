import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import { ARRAYS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './arrays-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';
import { ARRAYS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Same shared fixture as every other target's `arrays` test. The C#-specific thing under test is the
 * "a callee never mutates its caller's array" contract: C# passes a `List<T>` by reference, so unlike
 * C++ (value parameters) and Go (slice headers), this only holds because the compiler deep-copies
 * every reference-typed argument at the call site — see `sharp-value.ts`. `RunFunctions` passes its
 * own `x` into five sequential `call-function`s and still expects `[1, 2, 3]` afterwards, so a missing
 * copy would show up directly in this project's expected output.
 */

// Same generous budget as the cpp/Go/Rust versions — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays project on the C# target (ADR 0019 (private))', () => {
  it(
    "compiles arr-push/arr-pop/arr-shift/arr-unshift/foreach/from-to-cycle/struct-array onto List<T> and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileSharpProject({ documents: ARRAYS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_EXPECTED_RESULT_LINES.length)).toEqual(ARRAYS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

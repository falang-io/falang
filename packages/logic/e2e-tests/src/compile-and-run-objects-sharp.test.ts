import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, OBJECTS_PROJECT_DOCUMENTS } from './objects-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';
import { OBJECTS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Uses the **shared** cpp fixture, unlike the Go and Rust versions of this same project, which each
 * needed their own `objects-project-<lang>.fixture.ts` fork retyping `ObjC.y` from `float32` to
 * `int32`: C#, like C++, implicitly promotes an `int` to a `float` in mixed arithmetic, so
 * `ObjCSum`'s `c.x + c.y + ...` compiles as-is here — the already-documented "no implicit numeric
 * conversion" gap is Go's and Rust's, not a property of this compiler. Narrowing that result back to
 * the declared `int32` return type *is* explicit in C# (unlike C++), which the compiler handles with a
 * cast — see `sharp-value.ts`'s `toSharpTypedValue`.
 */

// Same generous budget as the cpp/Go/Rust versions — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('objects project on the C# target (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level C# compiler's first real project and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileSharpProject({ documents: OBJECTS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-objects-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, OBJECTS_EXPECTED_RESULT_LINES.length)).toEqual(OBJECTS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

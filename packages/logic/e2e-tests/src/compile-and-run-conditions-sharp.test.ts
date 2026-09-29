import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import { CONDITIONS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './conditions-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';
import { CONDITIONS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Same shared fixture as every other target's `conditions` test. The real exercise here is the C#
 * target's multi-level break/continue: C# has no labeled break/continue (unlike Go/Rust), so this is
 * the counter mechanism — `_break_level`/`_continue_level`/`_switch_break` — running for real on a
 * project full of nested switches, plus C#'s own mandatory per-case `break` (CS0163) and its
 * "not all code paths return a value" check (CS0161, which `TestReturn`'s loop-then-fall-off shape
 * trips exactly as Go's and Rust's equivalents did).
 */

// Same generous budget as the cpp/Go/Rust versions — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('conditions project on the C# target (ADR 0019 (private))', () => {
  it(
    "compiles multi-level break/continue through nested switches (counter bookkeeping, as in cpp — C# has no labeled break) and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileSharpProject({ documents: CONDITIONS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-conditions-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, CONDITIONS_EXPECTED_RESULT_LINES.length)).toEqual(CONDITIONS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import { ARRAYS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './arrays-project.fixture.js';
import { runGoProjectInDocker } from './run-go-project.js';
import { ARRAYS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Same fixture as the cpp `arrays` test (`arrays-project.fixture.ts`), reused verbatim rather than
 * forked — every value in this project is `int32`/`string`, so it never hits the Go adapter's
 * "no implicit numeric coercion" gap. Real exercise of `arr-push`/`arr-pop`/`arr-shift`/`arr-unshift`
 * (Go's `append`/slice-reassignment idiom, not C++'s in-place `std::vector` mutation — see
 * `go-leaf-emitters.ts`), `foreach` (Go's native `range`), exactly one `from-to-cycle`, array element
 * access (`x[index]`), and a struct-typed array (capitalized Go struct field declarations agreeing
 * with capitalized field access).
 */

const TEST_TITLE =
  "compiles arr-push/arr-pop/arr-shift/arr-unshift/foreach/from-to-cycle/struct-array to Go (append/range, not cpp's in-place mutation) and reproduces the old app's result.txt via the Docker build&run harness";

// Same generous timeout budget as the other Docker-backed tests in this package.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays project on the Go target (ADR 0019 (private))', () => {
  it(
    TEST_TITLE,
    async () => {
      const code = compileGoProject({ documents: ARRAYS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-go-'));
      try {
        await writeFile(join(dir, 'main.go'), code);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_EXPECTED_RESULT_LINES.length)).toEqual(ARRAYS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

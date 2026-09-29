import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, OBJECTS_PROJECT_DOCUMENTS } from './objects-project.fixture.js';
import { runGoProjectInDocker } from './run-go-project.js';
import { OBJECTS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * The shared cpp fixture, not a Go-specific fork — `compileExpression`'s Go adapter now does real
 * numeric-type coercion (`languages/golang-adapter.ts`'s `castNumericOperand`, plus
 * `go-leaf-emitters.ts`'s own `return`-narrowing cast, see ADR 0019 (private)'s numeric-coercion
 * follow-up), so `ObjCSum`'s `c.x + c.y + ...` (mixing an `int32` field with a `float32` one) compiles
 * to Go exactly like it always did to C++, closing the gap `objects-project-go.fixture.ts` used to work
 * around by retyping `ObjC.y` to `int32`. Expected output is unchanged from the cpp version, since
 * every value ever assigned to `ObjC.y` in this fixture is a whole number anyway.
 */

// Same generous budget as the cpp pilot test — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('objects pilot project on the Go target (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level Go compiler's first real project and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileGoProject({ documents: OBJECTS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-objects-go-'));
      try {
        await writeFile(join(dir, 'main.go'), code);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, OBJECTS_EXPECTED_RESULT_LINES.length)).toEqual(OBJECTS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

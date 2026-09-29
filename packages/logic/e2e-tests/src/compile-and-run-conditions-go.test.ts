import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import { CONDITIONS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './conditions-project.fixture.js';
import { runGoProjectInDocker } from './run-go-project.js';
import { CONDITIONS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Same fixture as the cpp `conditions` test (`conditions-project.fixture.ts`), reused verbatim rather
 * than forked — unlike `objects`, this project's every numeric value is `int32` (no `float32` mixed
 * in anywhere), so it never hits the Go adapter's already-documented "no implicit numeric coercion"
 * gap `objects-project-go.fixture.ts` had to work around. Real exercise of this compiler's own
 * multi-level break/continue mechanism (real Go labels, not cpp's counter bookkeeping — see
 * ADR 0019 (private)'s Go implementation notes) plus `switch`/`default` on a real project.
 */

// Same generous budget as the other Docker-backed tests in this package.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('conditions project on the Go target (ADR 0019 (private))', () => {
  it(
    "compiles multi-level break/continue through nested switches (real Go labels, not cpp's counters) and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileGoProject({ documents: CONDITIONS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-conditions-go-'));
      try {
        await writeFile(join(dir, 'main.go'), code);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, CONDITIONS_EXPECTED_RESULT_LINES.length)).toEqual(CONDITIONS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

import { describe, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileGoProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, MONTECARLO_PROJECT_DOCUMENTS } from './montecarlo-project.fixture.js';
import { runGoProjectInDocker } from './run-go-project.js';
import { MONTECARLO_EXPECTED_RESULT_LINES } from './expected-output.js';
import { expectResultLinesMatch } from './expect-result-lines.js';

// Same generous budget as every other compile-and-run test — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('MonteCarlo project on the Go target (ADR 0019 (private))', () => {
  it(
    "compiles MonteCarlo's Math.random mapping (math/rand's Float64, conditionally imported) and reproduces (within result.txt's own non-deterministic prefix match) the old app's expected output",
    async () => {
      const code = compileGoProject({ documents: MONTECARLO_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-montecarlo-go-'));
      try {
        await writeFile(join(dir, 'main.go'), code);
        const lines = await runGoProjectInDocker(dir);
        expectResultLinesMatch(lines, MONTECARLO_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

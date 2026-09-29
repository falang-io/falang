import { describe, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, MONTECARLO_PROJECT_DOCUMENTS } from './montecarlo-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';
import { MONTECARLO_EXPECTED_RESULT_LINES } from './expected-output.js';
import { expectResultLinesMatch } from './expect-result-lines.js';

// Same generous budget as every other compile-and-run test — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('MonteCarlo project on the C# target (ADR 0019 (private))', () => {
  it(
    "compiles MonteCarlo's Math.random mapping (a shared static Random field, not a new Random() per call — see sharp-adapter.ts) and reproduces (within result.txt's own non-deterministic prefix match) the old app's expected output",
    async () => {
      const code = compileSharpProject({ documents: MONTECARLO_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-montecarlo-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expectResultLinesMatch(lines, MONTECARLO_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

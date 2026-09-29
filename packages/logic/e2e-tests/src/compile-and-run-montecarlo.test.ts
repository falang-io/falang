import { describe, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, MONTECARLO_PROJECT_DOCUMENTS } from './montecarlo-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';
import { MONTECARLO_EXPECTED_RESULT_LINES } from './expected-output.js';
import { expectResultLinesMatch } from './expect-result-lines.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(montecarlo)\nadd_executable(main main.cpp)\n';

// Same generous budget as every other compile-and-run test — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('MonteCarlo project (ADR 0019 (private))', () => {
  it(
    "compiles the fourth and last migrated old test project on the C++ target and reproduces (within result.txt's own non-deterministic prefix match) the old app's expected output",
    async () => {
      const code = compileCppProject({ documents: MONTECARLO_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-montecarlo-cpp-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), code);
        const lines = await runCppProjectInDocker(dir);
        expectResultLinesMatch(lines, MONTECARLO_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

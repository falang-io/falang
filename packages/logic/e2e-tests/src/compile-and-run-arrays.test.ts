import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import { ARRAYS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './arrays-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';
import { ARRAYS_EXPECTED_RESULT_LINES } from './expected-output.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(arrays)\nadd_executable(main main.cpp)\n';

const TEST_TITLE =
  "compiles arr-push/arr-pop/arr-shift/arr-unshift/foreach/from-to-cycle/struct-array and reproduces the old app's result.txt via the Docker build&run harness";

// Same generous timeout budget as `run-cpp-project.test.ts`'s own smoke test — covers a cold image
// build on a standalone run; `npm run test-e2e-logic` pre-builds the image so this margin is rarely used.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays project (ADR 0019 (private))', () => {
  it(
    TEST_TITLE,
    async () => {
      const code = compileCppProject({ documents: ARRAYS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), code);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_EXPECTED_RESULT_LINES.length)).toEqual(ARRAYS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

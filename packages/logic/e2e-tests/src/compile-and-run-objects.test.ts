import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import { MAIN_DOCUMENT_ID, OBJECTS_PROJECT_DOCUMENTS } from './objects-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';
import { OBJECTS_EXPECTED_RESULT_LINES } from './expected-output.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(objects)\nadd_executable(main main.cpp)\n';

// Same generous budget as `run-cpp-project.test.ts`'s own smoke test — covers a cold image build on a standalone run; `npm run test-e2e-logic` pre-builds the image so this margin is rarely used.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('objects pilot project (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level C++ compiler's first real project and reproduces the old app's result.txt via the Docker build&run harness",
    async () => {
      const code = compileCppProject({ documents: OBJECTS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-objects-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), code);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, OBJECTS_EXPECTED_RESULT_LINES.length)).toEqual(OBJECTS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

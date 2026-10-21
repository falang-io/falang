import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import {
  DECIMALS_EXPECTED_RESULT_LINES,
  DECIMALS_MAIN_DOCUMENT_ID,
  DECIMALS_PROJECT_DOCUMENTS,
} from './decimals-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(numbers)\nadd_executable(main main.cpp)\n';

// Same generous budget as `run-cpp-project.test.ts`'s own smoke test — covers a cold image build on a standalone run; `npm run test-e2e-logic` pre-builds the image so this margin is rarely used.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('decimals project (ADR 0069 (private) §4)', () => {
  it(
    'compiles exact decimal arithmetic, rounding, stores and printing and prints the same lines on this target',
    async () => {
      const code = compileCppProject({
        documents: DECIMALS_PROJECT_DOCUMENTS,
        entryDocumentId: DECIMALS_MAIN_DOCUMENT_ID,
      });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-decimals-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), code);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, DECIMALS_EXPECTED_RESULT_LINES.length)).toEqual(DECIMALS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

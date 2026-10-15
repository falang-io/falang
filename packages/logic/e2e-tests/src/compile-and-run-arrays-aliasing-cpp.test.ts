import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import {
  ALIASING_MAIN_DOCUMENT_ID,
  ARRAYS_ALIASING_EXPECTED_RESULT_LINES,
  ARRAYS_ALIASING_PROJECT_DOCUMENTS,
} from './arrays-aliasing-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';

/** Inserting an `arr-slice` result into another array must leave the sliced array untouched (TypeScript semantics) — see `arrays-aliasing-project.fixture.ts`. */
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('arrays aliasing project on the C++ target (ADR 0019 (private))', () => {
  it(
    'arr-slice + arr-insert do not alias the sliced array',
    async () => {
      const code = compileCppProject({
        documents: ARRAYS_ALIASING_PROJECT_DOCUMENTS,
        entryDocumentId: ALIASING_MAIN_DOCUMENT_ID,
      });
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-arrays-aliasing-cpp-'));
      try {
        await writeFile(
          join(dir, 'CMakeLists.txt'),
          'cmake_minimum_required(VERSION 3.10)\nproject(arrays)\nadd_executable(main main.cpp)\n',
        );
        await writeFile(join(dir, 'main.cpp'), code);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, ARRAYS_ALIASING_EXPECTED_RESULT_LINES.length)).toEqual(
          ARRAYS_ALIASING_EXPECTED_RESULT_LINES,
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

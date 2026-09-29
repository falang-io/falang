import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import { CONDITIONS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './conditions-project.fixture.js';
import { runCppProjectInDocker } from './run-cpp-project.js';
import { CONDITIONS_EXPECTED_RESULT_LINES } from './expected-output.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(conditions)\nadd_executable(main main.cpp)\n';

describe('conditions project (ADR 0019 (private))', () => {
  it("compiles multi-level break/continue through nested switches on a real project and reproduces the old app's result.txt via the Docker build&run harness", async () => {
    const code = compileCppProject({ documents: CONDITIONS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

    const dir = await mkdtemp(join(tmpdir(), 'falang-logic-conditions-'));
    try {
      await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
      await writeFile(join(dir, 'main.cpp'), code);
      const lines = await runCppProjectInDocker(dir);
      expect(lines.slice(0, CONDITIONS_EXPECTED_RESULT_LINES.length)).toEqual(CONDITIONS_EXPECTED_RESULT_LINES);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 600_000);
});

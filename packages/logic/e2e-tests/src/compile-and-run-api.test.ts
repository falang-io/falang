import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCppProject } from '@falang/logic-constructor';
import { API_PROJECT_DOCUMENTS } from './api-project.fixture.js';
import { CPP_API_DRIVER } from './api-drivers/api-driver.cpp.js';
import { runCppProjectInDocker } from './run-cpp-project.js';
import { API_EXPECTED_RESULT_LINES } from './expected-output.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(api)\nadd_executable(main main.cpp)\n';

const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('call-api project (ADR 0019 (private))', () => {
  it(
    "compiles the statement-level C++ compiler's first call-api project and reproduces the old app's result.txt, driven by a hand-written API implementation, via the Docker build&run harness",
    async () => {
      // No `entryDocumentId`: a `call-api` project's own `main()` has to construct and register the
      // API implementations before calling into any compiled code, so the hand-written driver (not
      // the compiled artifact) owns `main()` here — see `CPP_API_DRIVER`'s own top comment.
      const code = compileCppProject({ documents: API_PROJECT_DOCUMENTS });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-api-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), `${code}\n\n${CPP_API_DRIVER}`);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, API_EXPECTED_RESULT_LINES.length)).toEqual(API_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

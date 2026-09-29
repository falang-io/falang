import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCppProjectInDocker } from './run-cpp-project.js';

const CMAKE_LISTS = 'cmake_minimum_required(VERSION 3.10)\nproject(smoke)\nadd_executable(main main.cpp)\n';

const MAIN_CPP = [
  '#include <iostream>',
  'int main() {',
  '  std::cout << "hello from docker" << std::endl;',
  '  std::cout << "line two" << std::endl;',
  '  return 0;',
  '}',
  '',
].join('\n');

// First run also builds the docker image (pulls `gcc:13-bookworm` + installs cmake) — slow.
// `npm run test-e2e-logic` pre-builds it via `scripts/build-logic-cpp-runner-image.sh` so this
// budget is only actually needed running this file standalone against a cold image cache.
const DOCKER_TEST_TIMEOUT_MS = 600_000;

describe('runCppProjectInDocker', () => {
  it(
    'builds and runs a minimal C++ project inside the pinned toolchain container',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-cpp-smoke-'));
      try {
        await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
        await writeFile(join(dir, 'main.cpp'), MAIN_CPP);
        const lines = await runCppProjectInDocker(dir);
        expect(lines.slice(0, 2)).toEqual(['hello from docker', 'line two']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_TEST_TIMEOUT_MS,
  );
});

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGoProjectInDocker } from './run-go-project.js';

const MAIN_GO = [
  'package main',
  '',
  'import "fmt"',
  '',
  'func main() {',
  '\tfmt.Println("hello from docker")',
  '\tfmt.Println("line two")',
  '}',
  '',
].join('\n');

// First run also builds the docker image (pulls `golang:1.23-bookworm`) — slow. Same budget as
// `run-cpp-project.test.ts`'s own smoke test.
const DOCKER_TEST_TIMEOUT_MS = 600_000;

describe('runGoProjectInDocker', () => {
  it(
    'builds and runs a minimal Go program inside the pinned toolchain container',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-go-smoke-'));
      try {
        await writeFile(join(dir, 'main.go'), MAIN_GO);
        const lines = await runGoProjectInDocker(dir);
        expect(lines.slice(0, 2)).toEqual(['hello from docker', 'line two']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_TEST_TIMEOUT_MS,
  );
});

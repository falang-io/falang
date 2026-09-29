import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';

const MAIN_CS = [
  'using System;',
  '',
  'public static class Program {',
  '  public static void Main() {',
  '    Console.WriteLine("hello from docker");',
  '    Console.WriteLine("line two");',
  '  }',
  '}',
  '',
].join('\n');

// First run also builds the docker image (pulls `mcr.microsoft.com/dotnet/sdk:8.0`) — slow. Same
// budget as the cpp/Go/Rust smoke tests.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('runSharpProjectInDocker', () => {
  it(
    'builds and runs a minimal C# program inside the pinned toolchain container',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-sharp-smoke-'));
      try {
        await writeSharpProjectFiles(dir, MAIN_CS);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, 2)).toEqual(['hello from docker', 'line two']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRustProjectInDocker } from './run-rust-project.js';

const MAIN_RS = ['fn main() {', '    println!("hello from docker");', '    println!("line two");', '}', ''].join('\n');

// First run also builds the docker image (pulls `rust:1.82-bookworm`) — slow. Same budget as
// `run-cpp-project.test.ts`'s/`run-go-project.test.ts`'s own smoke tests.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('runRustProjectInDocker', () => {
  it(
    'builds and runs a minimal Rust program inside the pinned toolchain container',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-rust-smoke-'));
      try {
        await writeFile(join(dir, 'main.rs'), MAIN_RS);
        const lines = await runRustProjectInDocker(dir);
        expect(lines.slice(0, 2)).toEqual(['hello from docker', 'line two']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

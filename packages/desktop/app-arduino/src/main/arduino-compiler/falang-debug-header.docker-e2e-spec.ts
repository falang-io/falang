import { spawn, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CPP_RUNNER_IMAGE_TAG, ensureCppRunnerImage } from '@falang/logic-e2e-tests';
import { buildFalangDebugHeader } from './falang-debug-header.js';

const execFile = promisify(execFileCallback);

// Same generous budget `@falang/logic-e2e-tests`' own docker-backed specs use — covers a cold image
// build on a standalone run (`npm run test-e2e-logic` pre-builds it, so this margin is rarely spent).
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

const CMAKE_LISTS = [
  'cmake_minimum_required(VERSION 3.10)',
  'project(falang_debug_protocol_check)',
  'include_directories(${CMAKE_CURRENT_SOURCE_DIR})',
  'add_executable(main main.cpp)',
].join('\n');

/**
 * A minimal `Serial`-shaped stand-in so `falang_debug.h` — written only against `Serial.print`/
 * `.println`/`.available`/`.read`, never anything AVR-specific — compiles and runs unmodified on the
 * host, talking over the process's own stdin/stdout instead of a UART. This is the "compiled for the
 * host with a stdio transport" half of ADR 0021 (private) §Phase 2's verification plan; it never
 * ships (it's written straight into a docker-mounted temp dir by this test, not part of the app).
 */
const HOST_ARDUINO_STUB = `#pragma once
#include <cstdio>
#include <cstdint>

class HardwareSerialStub {
public:
  void print(char c) { std::putchar(c); std::fflush(stdout); }
  void print(int v) { std::printf("%d", v); std::fflush(stdout); }
  void println(char c) { print(c); print('\\n'); }
  void println(int v) { print(v); print('\\n'); }
  void println(float v, int digits) { std::printf("%.*f\\n", digits, v); std::fflush(stdout); }
  int available() { return 1; }
  int read() { return std::getchar(); }
};

static HardwareSerialStub Serial;
`;

/**
 * Hand-written (not compiler-generated — that's `arduino-tracer.ts`'s job, unit-tested separately via
 * exact-string assertions) firmware exercising the real `falang_debug.h` state machine: three sibling
 * trace sites at the same call depth, the first carrying one `int32_t` variable. Mirrors the shape
 * `arduino-tracer.ts`'s `emitTrace`/`emitEnter` would actually generate for three statements in a row.
 */
const MAIN_CPP = `#include "falang_debug.h"

static void tracePoint(uint16_t idx) {
  FalangDebugFrame frame;
  if (falang_trace(idx)) {
    if (idx == 0) falang_var(0, (int32_t)42);
    falang_pause();
  }
}

int main() {
  falang_wait_attach();
  tracePoint(0);
  tracePoint(1);
  tracePoint(2);
  return 0;
}
`;

const buildUserArgs = (): string[] => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return typeof uid === 'number' && typeof gid === 'number' ? ['-u', `${uid}:${gid}`] : [];
};

const buildFixture = async (dir: string): Promise<void> => {
  await writeFile(join(dir, 'CMakeLists.txt'), CMAKE_LISTS);
  await writeFile(join(dir, 'Arduino.h'), HOST_ARDUINO_STUB);
  await writeFile(join(dir, 'falang_debug.h'), buildFalangDebugHeader(3));
  await writeFile(join(dir, 'main.cpp'), MAIN_CPP);
  await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    '-v',
    `${resolve(dir)}:/workspace`,
    CPP_RUNNER_IMAGE_TAG,
    'sh',
    '-c',
    'cmake . >/dev/null && cmake --build . >/dev/null',
  ]);
};

/** A line-buffered reader over the running container's stdout, so the test can await one protocol frame at a time instead of racing the whole transcript. */
class LineReader {
  private buffer = '';
  private readonly pending: ((line: string) => void)[] = [];
  private readonly queue: string[] = [];

  constructor(stream: NodeJS.ReadableStream) {
    stream.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newlineIndex = this.buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.deliver(line);
        newlineIndex = this.buffer.indexOf('\n');
      }
    });
  }

  private deliver(line: string): void {
    const waiter = this.pending.shift();
    if (waiter) waiter(line);
    else this.queue.push(line);
  }

  nextLine(): Promise<string> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift() ?? '');
    return new Promise((resolveLine) => {
      this.pending.push(resolveLine);
    });
  }
}

describe('falang_debug.h protocol — compiled and run on the host (ADR 0021 (private) §Phase 2, no hardware)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const runFixture = async (): Promise<{ reader: LineReader; write: (line: string) => void; done: Promise<void> }> => {
    await ensureCppRunnerImage();
    const dir = await mkdtemp(join(tmpdir(), 'falang-debug-protocol-'));
    dirs.push(dir);
    await buildFixture(dir);

    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        ...buildUserArgs(),
        '-v',
        `${resolve(dir)}:/workspace`,
        '-w',
        '/workspace',
        CPP_RUNNER_IMAGE_TAG,
        './main',
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    );
    const reader = new LineReader(child.stdout);
    const done = new Promise<void>((resolveExit, rejectExit) => {
      child.on('exit', (code) =>
        code === 0 ? resolveExit() : rejectExit(new Error(`main exited with code ${String(code)}`)),
      );
    });
    return { reader, write: (line) => child.stdin.write(`${line}\n`), done };
  };

  it(
    'R/A handshake, a pre-attach breakpoint pauses with its variable, C runs the rest to completion',
    async () => {
      const { reader, write, done } = await runFixture();

      expect(await reader.nextLine()).toBe('R');
      // Set a breakpoint on trace point 0 before attaching, then attach — unblocks falang_wait_attach().
      write('B 0 1');
      write('A');

      // Paused at index 0, call depth 1.
      expect(await reader.nextLine()).toBe('P 0 1');
      expect(await reader.nextLine()).toBe('V 0 i 42');
      // Continue — no breakpoint on 1/2, no step pending: both run without pausing.
      write('C');

      await done;
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );

  it(
    'a breakpoint toggled live while paused takes effect on the very next trace point, no rebuild',
    async () => {
      const { reader, write, done } = await runFixture();

      expect(await reader.nextLine()).toBe('R');
      write('B 0 1');
      write('A');
      expect(await reader.nextLine()).toBe('P 0 1');
      expect(await reader.nextLine()).toBe('V 0 i 42');
      // Toggle a second breakpoint while still paused at the first.
      write('B 1 1');
      write('C');

      // The live-toggled breakpoint fires.
      expect(await reader.nextLine()).toBe('P 1 1');
      // No breakpoint on 2, exits cleanly.
      write('C');

      await done;
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );

  it(
    'S (step) pauses at the next trace point regardless of its breakpoint bit — step-over semantics',
    async () => {
      const { reader, write, done } = await runFixture();

      expect(await reader.nextLine()).toBe('R');
      write('B 0 1');
      write('A');
      expect(await reader.nextLine()).toBe('P 0 1');
      expect(await reader.nextLine()).toBe('V 0 i 42');
      // Step, not continue — should stop at 1 even though it has no breakpoint.
      write('S');

      expect(await reader.nextLine()).toBe('P 1 1');
      // Step again — stops at 2 too.
      write('S');

      expect(await reader.nextLine()).toBe('P 2 1');
      // Finally let it run to completion.
      write('C');

      await done;
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});

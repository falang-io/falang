// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);

export const CPP_RUNNER_IMAGE_TAG = 'falang-logic-cpp-runner:latest';

// This file lives at `packages/logic/e2e-tests/src/` — four levels below the repo root, where
// `docker/logic-cpp-runner.Dockerfile` lives (same top-level `docker/` directory every other
// product Dockerfile in this repo uses, see `docker/backend.Dockerfile` etc.).
const REPO_ROOT = resolve(__dirname, '../../../..');
const DOCKERFILE_DIR = join(REPO_ROOT, 'docker');
const DOCKERFILE_PATH = join(DOCKERFILE_DIR, 'logic-cpp-runner.Dockerfile');

const cppRunnerImageExists = async (): Promise<boolean> => {
  try {
    await execFile('docker', ['image', 'inspect', CPP_RUNNER_IMAGE_TAG]);
    return true;
  } catch {
    return false;
  }
};

/** Builds the `logic-cpp-runner` image on first use; a no-op on every later call once it exists — callers don't need their own "is this already built" check. */
export const ensureCppRunnerImage = async (): Promise<void> => {
  if (await cppRunnerImageExists()) return;
  await execFile('docker', ['build', '-f', DOCKERFILE_PATH, '-t', CPP_RUNNER_IMAGE_TAG, DOCKERFILE_DIR]);
};

const BUILD_AND_RUN_SCRIPT = 'cmake . >/dev/null && cmake --build . >/dev/null && ./main';

/** Runs the container as the host's own uid/gid (when available — POSIX only) so build artifacts written into the bind-mounted `projectDir` aren't left root-owned on the host afterward. */
const buildUserArgs = (): string[] => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return typeof uid === 'number' && typeof gid === 'number' ? ['-u', `${uid}:${gid}`] : [];
};

/**
 * Builds (`cmake . && cmake --build .`) and runs (`./main`) a C++ project directory inside the
 * `logic-cpp-runner` image — the same two `cmake` invocations plus `./main` the old app ran directly
 * on the host (see `old/packages/tests/logic-compile-and-run/src/util/runners.ts`'s `runCpp`), just
 * containerized so the toolchain version is pinned instead of whatever `cmake`/`g++` happen to be on
 * the developer's machine. Returns stdout split into lines, matching the shape the old test runner
 * compared against `result.txt`.
 */
export const runCppProjectInDocker = async (projectDir: string): Promise<string[]> => {
  await ensureCppRunnerImage();
  const { stdout } = await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    '-v',
    `${resolve(projectDir)}:/workspace`,
    CPP_RUNNER_IMAGE_TAG,
    'sh',
    '-c',
    BUILD_AND_RUN_SCRIPT,
  ]);
  return stdout.split('\n');
};

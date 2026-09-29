// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);

export const GO_RUNNER_IMAGE_TAG = 'falang-logic-go-runner:latest';

// Same directory-layout assumption as `run-cpp-project.ts`.
const REPO_ROOT = resolve(__dirname, '../../../..');
const DOCKERFILE_DIR = join(REPO_ROOT, 'docker');
const DOCKERFILE_PATH = join(DOCKERFILE_DIR, 'logic-go-runner.Dockerfile');

const goRunnerImageExists = async (): Promise<boolean> => {
  try {
    await execFile('docker', ['image', 'inspect', GO_RUNNER_IMAGE_TAG]);
    return true;
  } catch {
    return false;
  }
};

/** Builds the `logic-go-runner` image on first use; a no-op on every later call once it exists — same posture as `ensureCppRunnerImage`. */
export const ensureGoRunnerImage = async (): Promise<void> => {
  if (await goRunnerImageExists()) return;
  await execFile('docker', ['build', '-f', DOCKERFILE_PATH, '-t', GO_RUNNER_IMAGE_TAG, DOCKERFILE_DIR]);
};

/** Runs the container as the host's own uid/gid (when available — POSIX only), same reasoning as `run-cpp-project.ts`'s `buildUserArgs` — though `go run` leaves far less behind than cmake's build tree (a module cache under `$GOPATH`, not files in `projectDir` itself), this still keeps any of it that does land in the bind mount from being root-owned. */
const buildUserArgs = (): string[] => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return typeof uid === 'number' && typeof gid === 'number' ? ['-u', `${uid}:${gid}`] : [];
};

/**
 * Real gotcha found running this under the host's own uid/gid: the `golang` base image's `$HOME` is
 * still `/root` regardless of which uid actually runs the container, and `go run`'s build cache
 * defaults to `$HOME/.cache/go-build` — a non-root uid can't create `/root/.cache` at all
 * ("permission denied"), so the very first `go run` inside the container failed outright. Fixed by
 * pointing `GOCACHE` at `/tmp` instead, which every image ships world-writable regardless of uid.
 */
const CACHE_ENV_ARGS = ['-e', 'GOCACHE=/tmp/go-cache'];

/**
 * Runs a single-file Go program directory inside the `logic-go-runner` image via `go run main.go` —
 * no `go build`/separate configure step needed (unlike the cpp harness's `cmake . && cmake --build .`)
 * since `go run` compiles and executes in one step, and no `go.mod` is required for a single
 * standard-library-only file (`go run` handles this as Go's special-cased "command-line-arguments"
 * pseudo-package even under default module-aware mode — confirmed directly against this image before
 * relying on it). Returns stdout split into lines, matching `runCppProjectInDocker`'s own shape.
 */
export const runGoProjectInDocker = async (projectDir: string): Promise<string[]> => {
  await ensureGoRunnerImage();
  const { stdout } = await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    ...CACHE_ENV_ARGS,
    '-v',
    `${resolve(projectDir)}:/workspace`,
    GO_RUNNER_IMAGE_TAG,
    'sh',
    '-c',
    'go run main.go',
  ]);
  return stdout.split('\n');
};

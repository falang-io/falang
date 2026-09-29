// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { ICompiledProjectFiles } from '@falang/logic-constructor';

const execFile = promisify(execFileCallback);

export const RUST_RUNNER_IMAGE_TAG = 'falang-logic-rust-runner:latest';

// Same directory-layout assumption as `run-cpp-project.ts`/`run-go-project.ts`.
const REPO_ROOT = resolve(__dirname, '../../../..');
const DOCKERFILE_DIR = join(REPO_ROOT, 'docker');
const DOCKERFILE_PATH = join(DOCKERFILE_DIR, 'logic-rust-runner.Dockerfile');

const rustRunnerImageExists = async (): Promise<boolean> => {
  try {
    await execFile('docker', ['image', 'inspect', RUST_RUNNER_IMAGE_TAG]);
    return true;
  } catch {
    return false;
  }
};

/** Builds the `logic-rust-runner` image on first use; a no-op on every later call once it exists — same posture as `ensureCppRunnerImage`/`ensureGoRunnerImage`. */
export const ensureRustRunnerImage = async (): Promise<void> => {
  if (await rustRunnerImageExists()) return;
  await execFile('docker', ['build', '-f', DOCKERFILE_PATH, '-t', RUST_RUNNER_IMAGE_TAG, DOCKERFILE_DIR]);
};

/** Runs the container as the host's own uid/gid (when available — POSIX only), same reasoning as `run-cpp-project.ts`'s/`run-go-project.ts`'s own `buildUserArgs`. */
const buildUserArgs = (): string[] => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return typeof uid === 'number' && typeof gid === 'number' ? ['-u', `${uid}:${gid}`] : [];
};

/**
 * Runs a single-file Rust program directory inside the `logic-rust-runner` image via
 * `rustc main.rs -o main && ./main` — no `cargo`/`Cargo.toml` needed at all (unlike a real Rust
 * project) since `rustc` compiles a standalone `.rs` file directly, and no cache-directory permission
 * workaround is needed either (confirmed directly against this image before relying on it) — unlike Go's
 * `go run` (see `run-go-project.ts`'s own `CACHE_ENV_ARGS` comment), plain `rustc` writes nothing
 * outside the given output path, so it never touches `$HOME` at all when run as the host's own uid/gid.
 * Returns stdout split into lines, matching `runCppProjectInDocker`'s/`runGoProjectInDocker`'s own shape.
 */
export const runRustProjectInDocker = async (projectDir: string): Promise<string[]> => {
  await ensureRustRunnerImage();
  const { stdout } = await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    '-v',
    `${resolve(projectDir)}:/workspace`,
    RUST_RUNNER_IMAGE_TAG,
    'sh',
    '-c',
    'rustc main.rs -o main && ./main',
  ]);
  return stdout.split('\n');
};

/**
 * The minimal `Cargo.toml` a `cargo`-based project (unlike the plain-`rustc` path above) needs to
 * depend on an external crate — only `rand` so far, needed by the `Math.random` mapping (see
 * `rust-adapter.ts`). `edition = "2021"` matches every other target's own "whatever the pinned
 * toolchain's default is" posture (no fixture needs a newer edition's syntax).
 */
const CARGO_TOML = [
  '[package]',
  'name = "falang_generated"',
  'version = "0.1.0"',
  'edition = "2021"',
  '',
  '[dependencies]',
  'rand = "0.8"',
  '',
].join('\n');

/**
 * A driver `Apis` implementation that answers no `call-api` endpoints at all — the shared boilerplate
 * every non-`call-api` compile-and-run test (objects/conditions/arrays/MonteCarlo) needs regardless,
 * since ADR 0019 (private)'s "Rust target — old-app layout" pass gives *every* compiled function an
 * `_apis: &mut dyn Apis` parameter unconditionally, even one that never calls an API itself — see
 * `emitRustApisTrait`'s own doc comment in `@falang/logic-constructor` for why. `entryFn` is the
 * `compileRustProject({ entryDocumentId })`-produced `falang::falang_entry` re-export every one of
 * these drivers calls.
 */
export const buildNoApiRustDriver = (): string =>
  [
    'mod falang;',
    '',
    'struct NoApi;',
    'impl falang::falang_global::Apis for NoApi {}',
    '',
    'fn main() {',
    '  let mut apis = NoApi;',
    '  falang::falang_entry(&mut apis);',
    '}',
    '',
  ].join('\n');

/**
 * Writes `compileRustProject`'s multi-file output under `<projectDir>/falang/` plus the hand-written
 * `driverMainRs` (an `Apis` implementation + `fn main()`) at `<projectDir>/main.rs` — the plain-`rustc`
 * harness layout (ADR 0019 (private)'s "Rust target — old-app layout" implementation notes). `rustc
 * main.rs -o main` (see `runRustProjectInDocker` below) resolves the driver's own `mod falang;`
 * declaration to `falang/mod.rs` automatically, the same way it always resolved a single-file `mod`
 * declaration — no extra compiler flag needed.
 */
export const writeRustFalangProjectFiles = async (
  projectDir: string,
  compiled: ICompiledProjectFiles,
  driverMainRs: string,
): Promise<void> => {
  const falangDir = join(projectDir, 'falang');
  await mkdir(falangDir, { recursive: true });
  await Promise.all(
    Object.entries(compiled.files).map(([fileName, content]) => writeFile(join(falangDir, fileName), content)),
  );
  await writeFile(join(projectDir, 'main.rs'), driverMainRs);
};

/**
 * The cargo-based counterpart to `writeRustFalangProjectFiles` — same multi-file `compiled.files`/
 * `driverMainRs` split, but under `<projectDir>/src/falang/`/`<projectDir>/src/main.rs` alongside a
 * `Cargo.toml` (needed only by projects, currently MonteCarlo, whose generated code depends on an
 * external crate plain `rustc` can't resolve — see `CARGO_TOML`'s own doc comment). Replaces the
 * previous single-string `writeRustCargoProjectFiles(projectDir, code)` now that `compileRustProject`
 * returns a multi-file `ICompiledProjectFiles` instead of one big string.
 */
export const writeRustCargoFalangProjectFiles = async (
  projectDir: string,
  compiled: ICompiledProjectFiles,
  driverMainRs: string,
): Promise<void> => {
  const srcFalangDir = join(projectDir, 'src', 'falang');
  await mkdir(srcFalangDir, { recursive: true });
  await writeFile(join(projectDir, 'Cargo.toml'), CARGO_TOML);
  await Promise.all(
    Object.entries(compiled.files).map(([fileName, content]) => writeFile(join(srcFalangDir, fileName), content)),
  );
  await writeFile(join(projectDir, 'src', 'main.rs'), driverMainRs);
};

/**
 * Runs a `cargo`-based Rust project directory (written by `writeRustCargoProjectFiles`) inside the
 * `logic-rust-runner` image via `cargo run --release --offline --quiet` — `--offline` relies on the
 * `rand` crate already being pre-fetched/pre-compiled into the image at build time (see
 * `docker/logic-rust-runner.Dockerfile`'s own comment) so this never needs network access during a
 * test; `--release` matches the old app's own documented run command (`cargo run -r`) and matters for
 * real here, unlike the other three migrated projects — MonteCarlo's 10-million-iteration loop is
 * meaningfully slower in debug mode. `--quiet` keeps cargo's own "Compiling.../Finished..." build
 * status off of stdout (it's on stderr by default already, same as `dotnet build`'s own noise
 * `runSharpProjectInDocker` redirects away — `--quiet` here is defense in depth, not load-bearing).
 * Returns stdout split into lines, same shape as every other runner in this package.
 */
export const runRustCargoProjectInDocker = async (projectDir: string): Promise<string[]> => {
  await ensureRustRunnerImage();
  const { stdout } = await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    '-v',
    `${resolve(projectDir)}:/workspace`,
    RUST_RUNNER_IMAGE_TAG,
    'cargo',
    'run',
    '--release',
    '--offline',
    '--quiet',
  ]);
  return stdout.split('\n');
};

// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);

export const SHARP_RUNNER_IMAGE_TAG = 'falang-logic-sharp-runner:latest';

// Same directory-layout assumption as `run-cpp-project.ts`/`run-go-project.ts`/`run-rust-project.ts`.
const REPO_ROOT = resolve(__dirname, '../../../..');
const DOCKERFILE_DIR = join(REPO_ROOT, 'docker');
const DOCKERFILE_PATH = join(DOCKERFILE_DIR, 'logic-sharp-runner.Dockerfile');

const sharpRunnerImageExists = async (): Promise<boolean> => {
  try {
    await execFile('docker', ['image', 'inspect', SHARP_RUNNER_IMAGE_TAG]);
    return true;
  } catch {
    return false;
  }
};

/** Builds the `logic-sharp-runner` image on first use; a no-op on every later call once it exists — same posture as `ensureCppRunnerImage`/`ensureGoRunnerImage`/`ensureRustRunnerImage`. */
export const ensureSharpRunnerImage = async (): Promise<void> => {
  if (await sharpRunnerImageExists()) return;
  await execFile('docker', ['build', '-f', DOCKERFILE_PATH, '-t', SHARP_RUNNER_IMAGE_TAG, DOCKERFILE_DIR]);
};

/**
 * The minimal project file `dotnet build` needs alongside `main.cs` — C#, unlike the other three
 * targets, can't be built from a bare source file by the SDK's own CLI (`dotnet run file.cs` is a
 * .NET 10 feature; this harness pins .NET 8). `ImplicitUsings` is off so the generated file's own
 * explicit `using` lines are the only ones in effect, and `Nullable` is off because this compiler
 * emits no nullable annotations at all.
 */
const MAIN_CSPROJ = [
  '<Project Sdk="Microsoft.NET.Sdk">',
  '  <PropertyGroup>',
  '    <OutputType>Exe</OutputType>',
  '    <TargetFramework>net8.0</TargetFramework>',
  '    <Nullable>disable</Nullable>',
  '    <ImplicitUsings>disable</ImplicitUsings>',
  '    <AssemblyName>main</AssemblyName>',
  '    <RootNamespace>main</RootNamespace>',
  '  </PropertyGroup>',
  '</Project>',
  '',
].join('\n');

/** Writes a compiled C# program plus the project file `runSharpProjectInDocker` expects, so each compile-and-run test doesn't carry its own copy of the `.csproj` boilerplate. */
export const writeSharpProjectFiles = async (projectDir: string, code: string): Promise<void> => {
  await writeFile(join(projectDir, 'main.cs'), code);
  await writeFile(join(projectDir, 'main.csproj'), MAIN_CSPROJ);
};

/** Runs the container as the host's own uid/gid (when available — POSIX only), same reasoning as the cpp/Go/Rust runners' own `buildUserArgs`. */
const buildUserArgs = (): string[] => {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return typeof uid === 'number' && typeof gid === 'number' ? ['-u', `${uid}:${gid}`] : [];
};

/**
 * `dotnet`'s CLI writes its own first-run state into `$HOME/.dotnet`, and the SDK image's `$HOME`
 * isn't writable by an arbitrary uid — so running as the host's own user fails outright with
 * `UnauthorizedAccessException: Access to the path '/.dotnet' is denied` without this. Exactly the
 * same class of gotcha as `run-go-project.ts`'s `GOCACHE` override (and, like it, `/tmp` is
 * world-writable in every image).
 */
const CACHE_ENV_ARGS = ['-e', 'DOTNET_CLI_HOME=/tmp', '-e', 'DOTNET_NOLOGO=1', '-e', 'DOTNET_CLI_TELEMETRY_OPTOUT=1'];

/**
 * `dotnet build`'s own stdout is redirected to `/dev/null` (as `cmake`'s is in the cpp runner) so the
 * returned lines are exactly the program's own output — the SDK prints build summaries and an
 * occasional workload notice to stdout, which would otherwise be indistinguishable from `result.txt`
 * lines. The built assembly is then run via `dotnet main.dll` rather than `dotnet run`, which would
 * re-enter the build machinery and print again.
 */
const BUILD_AND_RUN_SCRIPT = 'dotnet build main.csproj -v q --nologo >/dev/null && dotnet bin/Debug/net8.0/main.dll';

/** Builds and runs a generated C# project directory inside the `logic-sharp-runner` image, returning stdout split into lines — same shape as `runCppProjectInDocker`/`runGoProjectInDocker`/`runRustProjectInDocker`. */
export const runSharpProjectInDocker = async (projectDir: string): Promise<string[]> => {
  await ensureSharpRunnerImage();
  const { stdout } = await execFile('docker', [
    'run',
    '--rm',
    ...buildUserArgs(),
    ...CACHE_ENV_ARGS,
    '-v',
    `${resolve(projectDir)}:/workspace`,
    SHARP_RUNNER_IMAGE_TAG,
    'sh',
    '-c',
    BUILD_AND_RUN_SCRIPT,
  ]);
  return stdout.split('\n');
};

import { spawnArduinoCli } from './spawn-arduino-cli.js';
import type { TArduinoCliStream } from './spawn-arduino-cli.js';

export interface IInstalledCore {
  /** Platform id, e.g. `arduino:avr`. */
  readonly id: string;
  readonly version: string;
}

export interface ICoreCommandOptions {
  /** Extra environment layered over `process.env` (e.g. `ARDUINO_DIRECTORIES_DATA`). */
  readonly env?: Readonly<Record<string, string>>;
}

export type TListInstalledCoresResult =
  | { readonly ok: true; readonly cores: readonly IInstalledCore[] }
  | { readonly ok: false; readonly message: string };

interface ICoreListJsonEntry {
  readonly id?: unknown;
  readonly installed_version?: unknown;
}

/** `core list --json` is `{ platforms: [...] }` on 1.x; older CLIs print a bare array — both are accepted. */
const parseCoreList = (stdout: string): readonly IInstalledCore[] => {
  const parsed = JSON.parse(stdout) as unknown;
  const entries: unknown =
    Array.isArray(parsed) || parsed === null || typeof parsed !== 'object'
      ? parsed
      : (parsed as { platforms?: unknown }).platforms;
  if (!entries) return [];
  if (!Array.isArray(entries)) throw new Error('unexpected `core list --json` output');
  return (entries as ICoreListJsonEntry[]).flatMap((entry) =>
    typeof entry.id === 'string' && entry.id !== ''
      ? [{ id: entry.id, version: typeof entry.installed_version === 'string' ? entry.installed_version : '' }]
      : [],
  );
};

/** The board cores installed in arduino-cli's data directory. Never throws. */
export const listInstalledCores = async (options: ICoreCommandOptions = {}): Promise<TListInstalledCoresResult> => {
  const result = await spawnArduinoCli(['core', 'list', '--json'], options.env ? { env: options.env } : {});
  if (typeof result.spawnError === 'string') return { ok: false, message: result.spawnError };
  if (!result.ok)
    return { ok: false, message: result.output.trim() || `arduino-cli exited with ${String(result.exitCode)}` };
  try {
    return { ok: true, cores: parseCoreList(result.stdout) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

/** `true`/`false` when `core list` worked, `null` when it could not be answered (no CLI, bad output). */
export const isCoreInstalled = async (
  platformId: string,
  options: ICoreCommandOptions = {},
): Promise<boolean | null> => {
  const listed = await listInstalledCores(options);
  return listed.ok ? listed.cores.some((core) => core.id === platformId) : null;
};

export interface IInstallCoreParams extends ICoreCommandOptions {
  /** e.g. `arduino:avr`. */
  readonly platformId: string;
  /** Third-party Boards Manager indexes, passed per command (the user's `arduino-cli.yaml` is never edited). */
  readonly additionalUrls?: readonly string[];
  readonly onOutput?: (line: string, stream: TArduinoCliStream) => void;
  readonly signal?: AbortSignal;
}

export interface IInstallCoreResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  readonly message?: string;
}

const urlArgs = (urls: readonly string[]): string[] => urls.flatMap((url) => ['--additional-urls', url]);

/** `core update-index` then `core install <platformId>`, streamed, cancellable, no timeout. Never throws. */
export const installCore = async (params: IInstallCoreParams): Promise<IInstallCoreResult> => {
  const common = {
    ...(params.onOutput ? { onOutput: params.onOutput } : {}),
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.env ? { env: params.env } : {}),
  };
  const urls = urlArgs(params.additionalUrls ?? []);
  const steps: readonly (readonly string[])[] = [
    ['core', 'update-index', ...urls],
    ['core', 'install', params.platformId, ...urls],
  ];
  for (const args of steps) {
    // oxlint-disable-next-line no-await-in-loop -- the install needs the refreshed index.
    const result = await spawnArduinoCli(args, common);
    if (result.cancelled) return { ok: false, cancelled: true, message: 'Cancelled.' };
    if (!result.ok) {
      const message =
        result.spawnError ?? (result.output.trim() || `arduino-cli exited with ${String(result.exitCode)}`);
      return { ok: false, message };
    }
  }
  return { ok: true };
};

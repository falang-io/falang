// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __filename is the correct tool here.
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startSupervisedProcess, tsxEntryCommand } from './supervisor.js';
import type { ILocalService, ILocalServiceContext, ILocalServiceHandle } from './types.js';

/**
 * The ffmpeg job service (`@falang/workflow-media`, ADR 0041 (private)) as a local service: `media-*` actions call it
 * through `MEDIA_SERVICE_URL` (runners inherit it via `buildRunnerEnv`), it reads and writes files through the
 * backend's internal API with the caller's project token. ffmpeg and ffprobe come from `FALANG_FFMPEG`/`FALANG_FFPROBE`,
 * else `PATH` — they are never downloaded (where a packaged app gets them from is an open product question).
 */

const requireFromHere = createRequire(__filename);

export interface IResolveFfmpegParams {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  /** Test seam: resolves when the file is executable. */
  readonly isExecutable?: (file: string) => Promise<boolean>;
}

export interface IFfmpegBinaries {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

const defaultIsExecutable = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const executableName = (name: string, platform: NodeJS.Platform): string =>
  platform === 'win32' ? `${name}.exe` : name;

const findOnPath = async (
  name: string,
  params: IResolveFfmpegParams,
  platform: NodeJS.Platform,
  isExecutable: (file: string) => Promise<boolean>,
): Promise<string | null> => {
  const delimiter = platform === 'win32' ? ';' : ':';
  for (const dir of (params.env.PATH ?? params.env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, executableName(name, platform));
    // oxlint-disable-next-line no-await-in-loop -- first match wins, PATH order matters
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
};

export const FFMPEG_INSTALL_HINT =
  'install FFmpeg (Debian/Ubuntu: `apt install ffmpeg`, macOS: `brew install ffmpeg`, Windows: `winget install ' +
  'Gyan.FFmpeg`) so that `ffmpeg` and `ffprobe` are on PATH, or set FALANG_FFMPEG / FALANG_FFPROBE to their paths';

/**
 * Finds ffmpeg and ffprobe: an explicit `FALANG_FFMPEG`/`FALANG_FFPROBE` (must be executable — a wrong path is an
 * error, never silently replaced by another copy), else `PATH`. Without `FALANG_FFPROBE`, an ffprobe next to an
 * explicit `FALANG_FFMPEG` is preferred over `PATH`. Throws naming what is missing and how to install it.
 */
export const resolveFfmpegBinaries = async (params: IResolveFfmpegParams): Promise<IFfmpegBinaries> => {
  const platform = params.platform ?? process.platform;
  const isExecutable = params.isExecutable ?? defaultIsExecutable;
  const resolveOne = async (
    name: 'ffmpeg' | 'ffprobe',
    envKey: string,
    siblingOf: string | null = null,
  ): Promise<string> => {
    const explicit = params.env[envKey];
    if (explicit) {
      if (await isExecutable(explicit)) return explicit;
      throw new Error(`media: ${envKey}=${explicit} is not an executable file; ${FFMPEG_INSTALL_HINT}`);
    }
    if (siblingOf) {
      const sibling = path.join(path.dirname(siblingOf), executableName(name, platform));
      if (await isExecutable(sibling)) return sibling;
    }
    const found = await findOnPath(name, params, platform, isExecutable);
    if (found) return found;
    throw new Error(`media: \`${name}\` was not found on PATH; ${FFMPEG_INSTALL_HINT}`);
  };
  const ffmpeg = await resolveOne('ffmpeg', 'FALANG_FFMPEG');
  const ffprobe = await resolveOne('ffprobe', 'FALANG_FFPROBE', params.env.FALANG_FFMPEG ? ffmpeg : null);
  return { ffmpeg, ffprobe };
};

export interface IMediaEnvParams {
  readonly port: number;
  readonly backendInternalUrl: string;
  readonly workDir: string;
  readonly binaries: IFfmpegBinaries;
}

/** The media service's own environment (layered over `ctx.childEnv`). */
export const buildMediaEnv = (params: IMediaEnvParams): Record<string, string> => ({
  PORT: String(params.port),
  BACKEND_INTERNAL_URL: params.backendInternalUrl,
  MEDIA_WORK_DIR: params.workDir,
  MEDIA_FFMPEG_PATH: params.binaries.ffmpeg,
  MEDIA_FFPROBE_PATH: params.binaries.ffprobe,
});

/** `MEDIA_SERVICE_URL` for the backend and runners, `MEDIA_URL` for the e2e process (`WORKFLOW_E2E_MEDIA_URL`). */
export const buildMediaUrls = (
  port: number,
): { backendEnv: Record<string, string>; testEnv: Record<string, string> } => {
  const url = `http://127.0.0.1:${port}`;
  return { backendEnv: { MEDIA_SERVICE_URL: url }, testEnv: { MEDIA_URL: url } };
};

/** `@falang/workflow-media`'s entry point, resolved through the package (a workspace link or an installed copy). */
export const defaultMediaEntry = (): string =>
  path.join(path.dirname(requireFromHere.resolve('@falang/workflow-media/package.json')), 'src', 'main.ts');

export interface ICreateMediaServiceParams {
  readonly entry?: () => string;
  readonly resolveBinaries?: (env: Readonly<Record<string, string | undefined>>) => Promise<IFfmpegBinaries>;
}

export const createMediaService = (options: ICreateMediaServiceParams = {}): ILocalService => ({
  name: 'media',
  start: async (ctx: ILocalServiceContext): Promise<ILocalServiceHandle> => {
    const binaries = await (options.resolveBinaries ?? ((env) => resolveFfmpegBinaries({ env })))(ctx.childEnv);
    ctx.log(`[media] ffmpeg: ${binaries.ffmpeg}, ffprobe: ${binaries.ffprobe}`);
    const port = await ctx.findFreePort();
    const command = tsxEntryCommand((options.entry ?? defaultMediaEntry)());
    const proc = await startSupervisedProcess({
      name: 'media',
      ...command,
      env: {
        ...ctx.childEnv,
        ...buildMediaEnv({ port, backendInternalUrl: ctx.internalUrl, workDir: ctx.dataDir, binaries }),
      },
      cwd: ctx.dataDir,
      log: ctx.log,
      ready: { url: `http://127.0.0.1:${port}/health`, accept: (status) => status === 200 },
      onUnexpectedExit: (error) => ctx.log(`[media] ${error.message}`),
    });
    const urls = buildMediaUrls(port);
    return {
      backendEnv: urls.backendEnv,
      testEnv: urls.testEnv,
      capabilities: ['media'],
      stop: () => proc.stop(),
    };
  },
});

export const mediaService: ILocalService = createMediaService();

import path from 'node:path';
import {
  downloadBinary,
  getManagedBinaryPath,
  managedBinDir,
  resolveBinary,
  type IBinaryAsset,
} from './managed-binary.js';
import { startSupervisedProcess } from './supervisor.js';
import type { ILocalService, ILocalServiceContext, ILocalServiceHandle } from './types.js';

/**
 * mailpit (github.com/axllent/mailpit): an SMTP sink with an HTTP API — the backend's `SMTP_URL` points at it, the
 * e2e mail specs read the captured messages through `MAILPIT_URL`. One Go binary: `FALANG_MAILPIT`, else `PATH`, else
 * the managed bin directory (`<dataDir>/bin`, or `FALANG_LOCAL_BIN_DIR`), else downloaded there (pinned version, SHA-256 checked against the digests GitHub publishes
 * for the release assets — the release has no separate checksums file).
 */

export const MAILPIT_VERSION = '1.31.6';

/** SHA-256 of `mailpit-<os>-<arch>.<ext>` of `MAILPIT_VERSION`, from the GitHub release's asset digests. */
const MAILPIT_SHA256: Readonly<Record<string, string>> = {
  'linux-amd64': '10fa12ccc610f653d4ed4df848c1817f9935dcf4e9a6a458a19ab0fa02093f91',
  'linux-arm64': 'de07955b783236d9129da76da9a5970f1777834a18b2c07611de957be784dafe',
  'darwin-amd64': '2f89ed77d2e6623bf700de42236858d10dde1ba96a222c9dbdefd33fa094a6f3',
  'darwin-arm64': '1411270aa8fd7f4fb0cc358318754d7bb7c2c30bfd70572dd12d05a53e956373',
  'windows-amd64': '5d5ad094bfb3bac9004f9d1105d2335fea9f8952c09951df73ae0a280e34d3b1',
  'windows-arm64': 'c04c77ac9fd9da27c91259d0484b93b163e8534964682f543204cf3301a6b967',
};

export const MAILPIT_DEFAULT_FROM = 'noreply@falang.local';

export const buildMailpitAsset = (platform: NodeJS.Platform, arch: string): IBinaryAsset => {
  const osName = ({ win32: 'windows', darwin: 'darwin', linux: 'linux' } as Record<string, string>)[platform];
  const archName = ({ x64: 'amd64', arm64: 'arm64' } as Record<string, string>)[arch];
  const sha256 = osName && archName ? MAILPIT_SHA256[`${osName}-${archName}`] : null;
  if (!osName || !archName || !sha256) throw new Error(`No prebuilt mailpit for ${platform}/${arch}`);
  const fileName = `mailpit-${osName}-${archName}.${osName === 'windows' ? 'zip' : 'tar.gz'}`;
  return {
    url: `https://github.com/axllent/mailpit/releases/download/v${MAILPIT_VERSION}/${fileName}`,
    fileName,
    sha256,
    binaryPathInArchive: osName === 'windows' ? 'mailpit.exe' : 'mailpit',
  };
};

export interface IMailpitArgsParams {
  readonly smtpPort: number;
  readonly httpPort: number;
  /** SQLite file to keep messages in; `null` = mailpit's temporary database (deleted on exit). */
  readonly databaseFile: string | null;
}

/** Loopback only; any SMTP login accepted (the backend sends none); no reverse DNS lookups on connect. */
export const buildMailpitArgs = (params: IMailpitArgsParams): string[] => [
  '--smtp',
  `127.0.0.1:${params.smtpPort}`,
  '--listen',
  `127.0.0.1:${params.httpPort}`,
  '--smtp-auth-accept-any',
  '--smtp-auth-allow-insecure',
  '--smtp-disable-rdns',
  ...(params.databaseFile ? ['--database', params.databaseFile] : []),
];

export const buildMailpitEnv = (
  smtpPort: number,
  httpPort: number,
): { backendEnv: Record<string, string>; testEnv: Record<string, string> } => ({
  backendEnv: { SMTP_URL: `smtp://127.0.0.1:${smtpPort}`, MAIL_FROM: MAILPIT_DEFAULT_FROM },
  testEnv: { MAILPIT_URL: `http://127.0.0.1:${httpPort}` },
});

export interface IMailpitServiceDeps {
  readonly fetch?: typeof fetch;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
}

const INSTALL_HINT =
  'Install mailpit yourself (https://mailpit.axllent.org/docs/install/) and put it on PATH, or set FALANG_MAILPIT.';

/** Finds the mailpit binary, downloading it into the managed bin directory when there is none. */
export const resolveOrDownloadMailpit = async (
  ctx: Pick<ILocalServiceContext, 'rootDataDir' | 'childEnv' | 'log'>,
  deps: IMailpitServiceDeps = {},
): Promise<string> => {
  const platform = deps.platform ?? process.platform;
  const binDir = managedBinDir(ctx.childEnv, ctx.rootDataDir);
  const found = await resolveBinary({ name: 'mailpit', envVar: 'FALANG_MAILPIT', env: ctx.childEnv, binDir, platform });
  if (found) return found.file;
  ctx.log(`[mailpit] not found, downloading mailpit ${MAILPIT_VERSION}`);
  return downloadBinary({
    asset: buildMailpitAsset(platform, deps.arch ?? process.arch),
    target: getManagedBinaryPath(binDir, 'mailpit', platform),
    label: `mailpit ${MAILPIT_VERSION}`,
    installHint: INSTALL_HINT,
    fetch: deps.fetch,
  });
};

export const createMailpitService = (deps: IMailpitServiceDeps = {}): ILocalService => ({
  name: 'mailpit',
  start: async (ctx): Promise<ILocalServiceHandle> => {
    const binary = await resolveOrDownloadMailpit(ctx, deps);
    const smtpPort = await ctx.findFreePort();
    let httpPort = await ctx.findFreePort();
    // Two lookups in a row may hand out the same free port.
    while (httpPort === smtpPort) {
      // oxlint-disable-next-line no-await-in-loop -- retried only on a collision
      httpPort = await ctx.findFreePort();
    }
    const args = buildMailpitArgs({
      smtpPort,
      httpPort,
      // e2e runs start from scratch anyway; a real local install keeps its mails across restarts.
      databaseFile: ctx.testMode ? null : path.join(ctx.dataDir, 'mailpit.db'),
    });
    const child = await startSupervisedProcess({
      name: 'mailpit',
      command: binary,
      args,
      // `MP_*` variables would override the flags above.
      env: Object.fromEntries(Object.entries(ctx.childEnv).filter(([key]) => !key.startsWith('MP_'))),
      cwd: ctx.dataDir,
      log: ctx.log,
      ready: { url: `http://127.0.0.1:${httpPort}/api/v1/info`, accept: (status) => status === 200 },
      readyTimeoutMs: 30_000,
      onUnexpectedExit: (error) => ctx.log(`[mailpit] ${error.message}`),
    });
    ctx.log(`[mailpit] SMTP 127.0.0.1:${smtpPort}, web UI http://127.0.0.1:${httpPort}`);
    return { ...buildMailpitEnv(smtpPort, httpPort), capabilities: ['mail'], stop: () => child.stop() };
  },
});

export const mailpitService: ILocalService = createMailpitService();

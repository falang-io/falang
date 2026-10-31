import path from 'node:path';

export interface IBackendCommandParams {
  readonly isPackaged: boolean;
  /** Electron's `process.resourcesPath` (packaged builds only). */
  readonly resourcesPath: string;
  /** The app's own binary, run as plain Node via `ELECTRON_RUN_AS_NODE`. */
  readonly execPath: string;
  /** Dev only: the repository root. */
  readonly repoRoot: string;
  readonly dataDir: string;
  readonly statusFile: string;
  /** Public port; `0` = a free one. */
  readonly port: number;
}

export interface IBackendCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/**
 * The one place that knows how the local-mode backend is started. Dev: the sources of the workspace through `tsx`.
 * Packaged: a self-contained copy under `<resources>/backend-dist` (ADR 0072, private) and the built client next to it.
 */
export const resolveBackendCommand = (params: IBackendCommandParams): IBackendCommand => {
  const flags = [
    '--data-dir',
    params.dataDir,
    '--port',
    String(params.port),
    '--internal-port',
    '0',
    '--no-browser',
    '--status-file',
    params.statusFile,
  ];
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  if (params.isPackaged) {
    const cwd = path.join(params.resourcesPath, 'backend-dist');
    return {
      command: params.execPath,
      args: [
        '--import',
        'tsx',
        path.join(cwd, 'node_modules', '@falang', 'workflow-local', 'src', 'main.ts'),
        ...flags,
        '--client-dir',
        path.join(params.resourcesPath, 'client'),
      ],
      cwd,
      env,
    };
  }
  return {
    command: params.execPath,
    // No `--client-dir`: the CLI serves (and, when missing, builds) `packages/workflow/client/dist`.
    args: ['--import', 'tsx', path.join(params.repoRoot, 'packages', 'workflow', 'local', 'src', 'main.ts'), ...flags],
    cwd: params.repoRoot,
    env,
  };
};

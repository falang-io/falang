// oxlint-disable no-undefined, unicorn/switch-case-braces -- `argv[i]` may be undefined past the end; flat switch of flags.
export interface ICliArgs {
  dataDir: string;
  port?: number;
  internalPort?: number;
  clientDir?: string;
  openBrowser: boolean;
  temporalUi: boolean;
  skipClient: boolean;
  statusFile?: string;
}

export const parseLocalCliArgs = (argv: readonly string[], defaultDataDir: string): ICliArgs => {
  const args: ICliArgs = { dataDir: defaultDataDir, openBrowser: true, temporalUi: true, skipClient: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = (): string => {
      i += 1;
      const next = argv[i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    const port = (): number => {
      const raw = value();
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || n > 65_535) throw new Error(`${flag} must be a port number (0-65535), got "${raw}"`);
      return n;
    };
    switch (flag) {
      case '--data-dir':
        args.dataDir = value();
        break;
      case '--port':
        args.port = port();
        break;
      case '--internal-port':
        args.internalPort = port();
        break;
      case '--client-dir':
        args.clientDir = value();
        break;
      case '--no-browser':
        args.openBrowser = false;
        break;
      case '--no-ui':
        args.temporalUi = false;
        break;
      case '--status-file':
        args.statusFile = value();
        break;
      case '--skip-client':
        args.skipClient = true;
        break;
      default:
        throw new Error(`Unknown argument "${flag}"`);
    }
  }
  return args;
};

// oxlint-disable no-undefined, unicorn/switch-case-braces -- `argv[i]` may be undefined past the end; flat switch of flags.
import { isLocalServiceName, LOCAL_SERVICE_NAMES, type TLocalServiceName } from './services/types.js';

export interface ICliArgs {
  dataDir: string;
  port?: number;
  internalPort?: number;
  clientDir?: string;
  openBrowser: boolean;
  temporalUi: boolean;
  skipClient: boolean;
  statusFile?: string;
  singleUser: boolean;
  /** `--with a,b` (repeatable): optional services to start, deduplicated, in the given order. */
  services: TLocalServiceName[];
  /** `--test-mode`: an e2e run; services may enable test-only behaviour. */
  testMode: boolean;
}

/** Parses a `--with` value: comma-separated service names; empty items are ignored, unknown ones rejected. */
export const parseServiceList = (raw: string): TLocalServiceName[] =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (!isLocalServiceName(item)) {
        throw new Error(`Unknown service "${item}" in --with (known: ${LOCAL_SERVICE_NAMES.join(', ')})`);
      }
      return item;
    });

export const parseLocalCliArgs = (argv: readonly string[], defaultDataDir: string): ICliArgs => {
  const args: ICliArgs = {
    dataDir: defaultDataDir,
    openBrowser: true,
    temporalUi: true,
    skipClient: false,
    singleUser: false,
    services: [],
    testMode: false,
  };
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
      case '--single-user':
        args.singleUser = true;
        break;
      case '--skip-client':
        args.skipClient = true;
        break;
      case '--with':
        for (const name of parseServiceList(value())) if (!args.services.includes(name)) args.services.push(name);
        break;
      case '--test-mode':
        args.testMode = true;
        break;
      default:
        throw new Error(`Unknown argument "${flag}"`);
    }
  }
  return args;
};

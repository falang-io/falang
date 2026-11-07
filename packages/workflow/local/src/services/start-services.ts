import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getOrCreateSecret } from '../secrets.js';
import { findFreePort } from '../temporal/temporal-dev-server.js';
import type {
  ILocalService,
  ILocalServiceHandle,
  ILocalServiceStatus,
  TLocalServiceCapability,
  TLocalServiceName,
} from './types.js';

export interface IStartLocalServicesParams {
  /** The local mode's data directory; each service gets `services/<name>/` inside it. */
  readonly dataDir: string;
  readonly log: (line: string) => void;
  readonly publicUrl: string;
  readonly internalUrl: string;
  readonly testMode: boolean;
  /** Base env of service child processes (platform secrets already removed). */
  readonly childEnv: NodeJS.ProcessEnv;
  /** Name -> service; `getLocalService` from `./index.js` in production. */
  readonly resolve: (name: TLocalServiceName) => ILocalService;
}

export interface IStartedLocalServices {
  readonly names: readonly TLocalServiceName[];
  /** Merged `backendEnv` of every service (later services win on a clash, which is reported in the log). */
  readonly backendEnv: Readonly<Record<string, string>>;
  readonly backendSecretEnv: Readonly<Record<string, string>>;
  /** The status file's `services` map. */
  readonly status: Readonly<Partial<Record<TLocalServiceName, ILocalServiceStatus>>>;
  readonly capabilities: readonly TLocalServiceCapability[];
  /** Stops every service, last started first; failures are logged, never thrown. */
  stop(): Promise<void>;
}

const stopAll = async (
  started: readonly { name: TLocalServiceName; handle: ILocalServiceHandle }[],
  log: (line: string) => void,
): Promise<void> => {
  for (const { name, handle } of started.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- reverse start order, one at a time
    await handle.stop().catch((error: unknown) => log(`[local] stopping ${name} failed: ${String(error)}`));
  }
};

const mergeEnv = (
  target: Record<string, string>,
  source: Readonly<Record<string, string>> | undefined,
  name: string,
  log: (line: string) => void,
): void => {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (key in target && target[key] !== value) log(`[local] ${name} overrides ${key} set by an earlier service`);
    target[key] = value;
  }
};

/**
 * Starts the requested services one after another (duplicates ignored). If one fails, the ones already started are
 * stopped and the error is rethrown. Nothing is written to `process.env` here — the caller applies `backendEnv`.
 */
export const startLocalServices = async (
  requested: readonly TLocalServiceName[],
  params: IStartLocalServicesParams,
): Promise<IStartedLocalServices> => {
  const names = [...new Set(requested)];
  // Resolve every name first: an unknown/unimplemented one fails before anything is started.
  const services = names.map((name) => ({ name, service: params.resolve(name) }));
  const started: { name: TLocalServiceName; handle: ILocalServiceHandle }[] = [];
  const backendEnv: Record<string, string> = {};
  const backendSecretEnv: Record<string, string> = {};
  const status: Partial<Record<TLocalServiceName, ILocalServiceStatus>> = {};
  const capabilities = new Set<TLocalServiceCapability>();
  try {
    for (const { name, service } of services) {
      const dataDir = path.join(params.dataDir, 'services', name);
      // oxlint-disable-next-line no-await-in-loop -- services start one after another
      await mkdir(dataDir, { recursive: true });
      params.log(`[local] starting ${name}`);
      // oxlint-disable-next-line no-await-in-loop -- services start one after another
      const handle = await service.start({
        name,
        dataDir,
        rootDataDir: params.dataDir,
        log: params.log,
        findFreePort: (host) => findFreePort(host),
        publicUrl: params.publicUrl,
        internalUrl: params.internalUrl,
        testMode: params.testMode,
        childEnv: { ...params.childEnv },
        getSecret: (key) => getOrCreateSecret(params.dataDir, key),
      });
      started.push({ name, handle });
      mergeEnv(backendEnv, handle.backendEnv, name, params.log);
      mergeEnv(backendSecretEnv, handle.backendSecretEnv, name, params.log);
      for (const capability of handle.capabilities ?? []) capabilities.add(capability);
      status[name] = { testEnv: { ...handle.testEnv }, capabilities: [...(handle.capabilities ?? [])] };
    }
  } catch (error) {
    await stopAll(started, params.log);
    throw error;
  }
  let stopping: Promise<void> | null = null;
  return {
    names,
    backendEnv,
    backendSecretEnv,
    status,
    capabilities: [...capabilities],
    stop: () => {
      stopping ??= stopAll(started, params.log);
      return stopping;
    },
  };
};

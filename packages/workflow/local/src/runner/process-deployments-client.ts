import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { IK8sDeploymentsClient, V1Deployment } from '@falang/workflow-backend';

export type TSpawnFn = (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface IProcessDeploymentsClientParams {
  /** The runner entry point: `file` is the executable, `args` its arguments (e.g. `node` + `['--import', 'tsx', '<runner main>']`). */
  readonly command: { readonly file: string; readonly args: readonly string[] };
  /** Environment layered under the Deployment's env; defaults to `process.env`. */
  readonly baseEnv?: NodeJS.ProcessEnv;
  /** Receives the runner's lifecycle lines; defaults to `console.log`. */
  readonly log?: (line: string) => void;
  /** Grace period between SIGTERM and SIGKILL on `delete`. Default 10 000 ms. */
  readonly killTimeoutMs?: number;
  /** Injectable for tests; defaults to `child_process.spawn`. */
  readonly spawn?: TSpawnFn;
}

export interface IProcessDeploymentsClient extends IK8sDeploymentsClient {
  /** Terminates every runner process (shutdown). */
  stopAll(): Promise<void>;
}

interface IRunnerProcess {
  readonly name: string;
  readonly labels: Record<string, string>;
  readonly createdAt: Date;
  readonly child: ChildProcess;
  exited: boolean;
  readonly exitPromise: Promise<boolean>;
}

const DEFAULT_KILL_TIMEOUT_MS = 10_000;

/** Matches the equality forms of a k8s label selector (`k=v`, `k==v`, `k!=v`, bare `k`, comma-joined). */
export const matchesLabelSelector = (labels: Record<string, string>, selector: string): boolean =>
  selector
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .every((term) => {
      const notEqual = /^([^!=]+)!=(.*)$/.exec(term);
      if (notEqual) return labels[(notEqual[1] ?? '').trim()] !== (notEqual[2] ?? '').trim();
      const equal = /^([^=]+)==?(.*)$/.exec(term);
      if (equal) return labels[(equal[1] ?? '').trim()] === (equal[2] ?? '').trim();
      return term in labels;
    });

const deploymentEnv = (deployment: V1Deployment): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const entry of deployment.spec?.template.spec?.containers[0]?.env ?? []) {
    if (typeof entry.value === 'string') env[entry.name] = entry.value;
  }
  return env;
};

/**
 * Local-mode `IK8sDeploymentsClient`: a "Deployment" is a child process of the backend. The Deployment's container env
 * is layered over `baseEnv` (except `HOME`, which in a pod points at the writable `/tmp` volume — a local child keeps
 * the host's), image/resources/namespace are ignored. State lives in memory only: a backend restart takes its
 * children with it, which matches the manager's own "pods are disposable" assumption.
 */
export const createProcessDeploymentsClient = (params: IProcessDeploymentsClientParams): IProcessDeploymentsClient => {
  const spawnFn: TSpawnFn = params.spawn ?? ((file, args, options) => nodeSpawn(file, [...args], options));
  // oxlint-disable-next-line no-console -- the default sink for runner lifecycle lines; callers can inject their own.
  const log = params.log ?? ((line: string) => console.log(line));
  const killTimeoutMs = params.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS;
  const processes = new Map<string, IRunnerProcess>();

  const terminate = async (record: IRunnerProcess): Promise<void> => {
    if (record.exited) return;
    record.child.kill('SIGTERM');
    const timer = Promise.withResolvers<boolean>();
    const handle = setTimeout(() => timer.resolve(true), killTimeoutMs);
    const hardKill = await Promise.race([record.exitPromise.then(() => false), timer.promise]);
    clearTimeout(handle);
    if (hardKill) {
      record.child.kill('SIGKILL');
      await record.exitPromise;
    }
  };

  const start = (name: string, deployment: V1Deployment): void => {
    const { HOME: _hostHome, ...podEnv } = deploymentEnv(deployment);
    const child = spawnFn(params.command.file, params.command.args, {
      env: { ...(params.baseEnv ?? process.env), ...podEnv },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const exited = Promise.withResolvers<boolean>();
    const record: IRunnerProcess = {
      name,
      labels: { ...deployment.metadata?.labels },
      createdAt: new Date(),
      child,
      exited: false,
      exitPromise: exited.promise,
    };
    processes.set(name, record);
    log(`[runner ${name}] started (pid ${child.pid ?? '?'})`);
    const onGone = (description: string) => {
      if (record.exited) return;
      record.exited = true;
      if (processes.get(name) === record) processes.delete(name);
      log(`[runner ${name}] ${description}`);
      exited.resolve(true);
    };
    child.on('exit', (code, signal) => onGone(`exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`));
    child.on('error', (error) => onGone(`failed: ${error.message}`));
  };

  const matching = (selector: string): IRunnerProcess[] =>
    [...processes.values()].filter((record) => matchesLabelSelector(record.labels, selector));

  return {
    async apply(_namespace, deployment) {
      const name = deployment.metadata?.name;
      if (!name) throw new Error('Deployment must have metadata.name');
      const existing = processes.get(name);
      if (existing) {
        processes.delete(name);
        await terminate(existing);
      }
      start(name, deployment);
    },
    async delete(_namespace, name) {
      const record = processes.get(name);
      if (!record) return;
      processes.delete(name);
      await terminate(record);
    },
    // oxlint-disable-next-line require-await -- matches the async client contract; answered from memory.
    async exists(_namespace, name) {
      return processes.has(name);
    },
    // oxlint-disable-next-line require-await -- matches the async client contract; answered from memory.
    async listNames(_namespace, labelSelector) {
      return matching(labelSelector).map((record) => record.name);
    },
    // oxlint-disable-next-line require-await -- matches the async client contract; answered from memory.
    async listAll(_namespace, labelSelector) {
      return matching(labelSelector).map((record) => ({
        name: record.name,
        labels: { ...record.labels },
        createdAt: record.createdAt,
      }));
    },
    async stopAll() {
      const all = [...processes.values()];
      processes.clear();
      await Promise.all(all.map((record) => terminate(record)));
    },
  };
};

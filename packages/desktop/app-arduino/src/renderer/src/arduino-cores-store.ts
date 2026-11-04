import { action, makeObservable, observable, runInAction } from 'mobx';
import type {
  IArduinoCoreInstallResult,
  IArduinoCoreOutputLine,
  IArduinoCoreStatus,
} from '../../shared/arduino-core-ipc-types.js';
import { appendOutputLines } from './arduino-cli-ui-model.js';
import { reportError } from '../../shared/report-error.js';

/** What the store needs of `window.falang.arduinoCores` (a fake in tests). */
export interface IArduinoCoresApi {
  getStatus(fqbn: string): Promise<IArduinoCoreStatus>;
  install(fqbn: string): Promise<IArduinoCoreInstallResult>;
  cancelInstall(): Promise<void>;
  onOutput(listener: (line: IArduinoCoreOutputLine) => void): () => void;
}

/** The board core the open project needs: installed or not, plus the live output of an install. */
export class ArduinoCoresStore {
  @observable.ref status: IArduinoCoreStatus | null = null;
  @observable installing = false;
  @observable.ref output: readonly string[] = [];
  @observable error: string | null = null;

  private readonly getApi: () => IArduinoCoresApi;

  constructor(getApi: () => IArduinoCoresApi) {
    this.getApi = getApi;
    makeObservable(this);
  }

  /** Whether the "core not installed" warning applies (the CLI works and the core is absent). */
  get missing(): boolean {
    return (
      this.status !== null && this.status.cliAvailable && this.status.platformId !== null && !this.status.installed
    );
  }

  async refresh(fqbn: string): Promise<void> {
    const status = await this.getApi().getStatus(fqbn);
    runInAction(() => (this.status = status));
  }

  async install(fqbn: string): Promise<boolean> {
    const api = this.getApi();
    runInAction(() => {
      this.installing = true;
      this.error = null;
      this.output = [];
    });
    const unsubscribe = api.onOutput((line) =>
      runInAction(() => (this.output = appendOutputLines(this.output, line.line))),
    );
    try {
      const result = await api.install(fqbn);
      runInAction(() => {
        if (!result.ok && result.cancelled !== true) this.error = result.message ?? null;
      });
      await this.refresh(fqbn);
      return result.ok;
    } catch (error) {
      reportError('Failed to install the board core', error);
      runInAction(() => (this.error = error instanceof Error ? error.message : String(error)));
      return false;
    } finally {
      unsubscribe();
      runInAction(() => (this.installing = false));
    }
  }

  async cancelInstall(): Promise<void> {
    await this.getApi().cancelInstall();
  }

  @action reset(): void {
    this.status = null;
    this.output = [];
    this.error = null;
  }
}

export const arduinoCoresStore = new ArduinoCoresStore(() => globalThis.falang.arduinoCores);

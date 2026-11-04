import { action, makeObservable, observable, runInAction } from 'mobx';
import type {
  IArduinoCliChangedPayload,
  IArduinoCliCheckUpdatesResult,
  IArduinoCliFullStatus,
  IArduinoCliProgress,
  IArduinoCliSettingsInput,
  TArduinoCliBusyKind,
  TArduinoCliInstallResult,
  TArduinoCliSetSettingsResult,
} from '../../shared/arduino-cli-ipc-types.js';
import type { IArduinoCliSettings } from '@falang/desktop-arduino-cli';
import { reportError } from '../../shared/report-error.js';

/** What the store needs of `window.falang.arduinoCli` (a fake in tests). */
export interface IArduinoCliApi {
  getStatus(): Promise<IArduinoCliFullStatus>;
  getSettings(): Promise<IArduinoCliSettings>;
  setSettings(settings: IArduinoCliSettingsInput): Promise<TArduinoCliSetSettingsResult>;
  install(version?: string): Promise<TArduinoCliInstallResult>;
  cancelInstall(): Promise<void>;
  checkUpdates(force?: boolean): Promise<IArduinoCliCheckUpdatesResult>;
  onProgress(listener: (progress: IArduinoCliProgress) => void): () => void;
  onChanged(listener: (payload: IArduinoCliChangedPayload) => void): () => void;
}

/** The renderer's view of the resolved `arduino-cli`: shared by the settings modal and the build panel. */
export class ArduinoCliStatusStore {
  @observable.ref status: IArduinoCliFullStatus | null = null;
  @observable.ref settings: IArduinoCliSettings | null = null;
  @observable.ref progress: IArduinoCliProgress | null = null;
  @observable installing = false;
  @observable checking = false;
  @observable installError: string | null = null;
  @observable.ref busy: TArduinoCliBusyKind | null = null;

  private unsubscribers: (() => void)[] = [];
  private subscribers = 0;

  private readonly getApi: () => IArduinoCliApi;

  constructor(getApi: () => IArduinoCliApi) {
    this.getApi = getApi;
    makeObservable(this);
  }

  /** Reference-counted: both the modal and the build panel start it while they are open. */
  start(): () => void {
    this.subscribers += 1;
    if (this.subscribers === 1) {
      const api = this.getApi();
      this.unsubscribers = [
        api.onProgress((progress) => runInAction(() => (this.progress = progress))),
        api.onChanged((payload) => {
          runInAction(() => (this.busy = payload.busy));
          this.refresh().catch((error: unknown) => reportError('Failed to refresh arduino-cli status', error));
        }),
      ];
    }
    this.refresh().catch((error: unknown) => reportError('Failed to load arduino-cli status', error));
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.subscribers -= 1;
      if (this.subscribers === 0) {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers = [];
      }
    };
  }

  async refresh(): Promise<void> {
    const api = this.getApi();
    const [status, settings] = await Promise.all([api.getStatus(), api.getSettings()]);
    runInAction(() => {
      this.status = status;
      this.settings = settings;
      this.busy = status.busy;
    });
  }

  /** Downloads the latest CLI (progress through `progress`); returns whether it succeeded. */
  async install(): Promise<boolean> {
    runInAction(() => {
      this.installing = true;
      this.installError = null;
      this.progress = null;
    });
    try {
      const result = await this.getApi().install();
      runInAction(() => {
        if (!result.ok && result.cancelled !== true) this.installError = result.message;
      });
      await this.refresh();
      return result.ok;
    } catch (error) {
      runInAction(() => (this.installError = error instanceof Error ? error.message : String(error)));
      return false;
    } finally {
      runInAction(() => {
        this.installing = false;
        this.progress = null;
      });
    }
  }

  async cancelInstall(): Promise<void> {
    await this.getApi().cancelInstall();
  }

  async checkUpdates(): Promise<void> {
    runInAction(() => (this.checking = true));
    try {
      await this.getApi().checkUpdates(true);
      await this.refresh();
    } finally {
      runInAction(() => (this.checking = false));
    }
  }

  async setSettings(input: IArduinoCliSettingsInput): Promise<TArduinoCliSetSettingsResult> {
    const result = await this.getApi().setSettings(input);
    await this.refresh();
    return result;
  }

  @action clearInstallError(): void {
    this.installError = null;
  }
}

export const arduinoCliStatusStore = new ArduinoCliStatusStore(() => globalThis.falang.arduinoCli);

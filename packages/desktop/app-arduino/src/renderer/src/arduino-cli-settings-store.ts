import { action, makeObservable, observable, runInAction } from 'mobx';
import { arduinoCliStatusStore, type ArduinoCliStatusStore } from './arduino-cli-status-store.js';
import { buildSettingsInput, needsDownloadBeforeSave, type ICliSettingsForm } from './arduino-cli-ui-model.js';

/** The "Settings → arduino-cli…" modal: open flag, the form being edited and the last save error. */
export class ArduinoCliSettingsModalStore {
  @observable isOpen = false;
  @observable source: ICliSettingsForm['source'] = 'system';
  @observable customPath = '';
  @observable checkUpdates = true;
  @observable saving = false;
  @observable error: string | null = null;

  private readonly statusStore: ArduinoCliStatusStore;

  constructor(statusStore: ArduinoCliStatusStore) {
    this.statusStore = statusStore;
    makeObservable(this);
  }

  get form(): ICliSettingsForm {
    return { source: this.source, customPath: this.customPath, checkUpdates: this.checkUpdates };
  }

  /** Opens the modal; `source` pre-selects an option (the build panel's "Choose path…"). */
  async open(source: ICliSettingsForm['source'] | null = null): Promise<void> {
    runInAction(() => {
      this.isOpen = true;
      this.error = null;
    });
    await this.loadForm();
    if (source !== null) runInAction(() => (this.source = source));
  }

  @action close(): void {
    this.isOpen = false;
  }

  async loadForm(): Promise<void> {
    await this.statusStore.refresh();
    const settings = this.statusStore.settings;
    runInAction(() => {
      this.source = settings?.source ?? 'system';
      this.customPath = settings?.customPath ?? '';
      this.checkUpdates = settings?.checkUpdates !== false;
    });
  }

  @action setSource(source: ICliSettingsForm['source']): void {
    this.source = source;
    this.error = null;
  }

  @action setCustomPath(value: string): void {
    this.customPath = value;
  }

  @action setCheckUpdates(value: boolean): void {
    this.checkUpdates = value;
  }

  async browse(): Promise<void> {
    const picked = await globalThis.falang.dialog.openFile();
    if (picked !== null) runInAction(() => (this.customPath = picked));
  }

  /** Saves; "Downloaded" with nothing downloaded downloads first. Returns whether the modal may close. */
  async save(): Promise<boolean> {
    runInAction(() => {
      this.saving = true;
      this.error = null;
    });
    try {
      if (needsDownloadBeforeSave(this.form, this.statusStore.status)) {
        const installed = await this.statusStore.install();
        if (!installed) {
          runInAction(() => (this.error = this.statusStore.installError));
          return false;
        }
      }
      const result = await this.statusStore.setSettings(buildSettingsInput(this.form));
      if (!result.ok) {
        runInAction(() => (this.error = result.message));
        return false;
      }
      return true;
    } finally {
      runInAction(() => (this.saving = false));
    }
  }
}

export const arduinoCliSettingsModalStore = new ArduinoCliSettingsModalStore(arduinoCliStatusStore);

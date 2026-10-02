import { action, makeObservable, observable, runInAction } from 'mobx';
import { reportError } from '../../shared/report-error.js';
import type {
  IDriverBundle,
  IDriverListEntry,
  IDriverUsage,
  IDriverValidationResult,
  TDriverEditScope,
  TDriverScope,
} from '../../shared/driver-ipc-types.js';

/** Kebab-case, same rule as `driver-config.ts`'s `id` (checked here so the user gets the message before any IPC). */
export const DRIVER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** What the result panel shows: a title, optionally a validation result and/or the usages that blocked a delete. */
export interface IDriversResultPanel {
  readonly title: string;
  readonly validation?: IDriverValidationResult;
  readonly usages?: readonly IDriverUsage[];
  /** A plain message (e.g. the file written by Download, an error from a failed call). */
  readonly message?: string;
  readonly isError?: boolean;
}

export interface IDriversViewing {
  readonly id: string;
  readonly scope: TDriverScope;
  readonly bundle: IDriverBundle;
}

/**
 * State of the Sketch → Drivers… dialog (ADR 0054 (private) §5) and every action behind its buttons. The driver
 * list itself lives in `driversRegistry` (kept current by `drivers:changed`); this store never refreshes it after
 * a write — main's own `drivers:changed` event does, and a second, racing refresh would eat the "configs changed"
 * signal the project store rebuilds schemes on.
 */
export class DriversModalStore {
  @observable isOpen = false;
  /** The label of the call in flight (validate/save run `arduino-cli`, which takes a while), or `null`. */
  @observable busy: string | null = null;
  @observable.ref result: IDriversResultPanel | null = null;
  @observable.ref viewing: IDriversViewing | null = null;
  @observable isTemplateFormOpen = false;

  constructor() {
    makeObservable(this);
  }

  @action open(): void {
    this.isOpen = true;
  }

  @action close(): void {
    this.isOpen = false;
    this.result = null;
    this.viewing = null;
    this.isTemplateFormOpen = false;
  }

  @action closeResult(): void {
    this.result = null;
  }

  @action closeViewing(): void {
    this.viewing = null;
  }

  @action setTemplateFormOpen(open: boolean): void {
    this.isTemplateFormOpen = open;
  }

  /** Runs one IPC call under the spinner; a thrown error becomes an error result panel instead of an unhandled rejection. */
  private async run<T>(label: string, title: string, call: () => Promise<T>): Promise<T | null> {
    runInAction(() => (this.busy = label));
    try {
      return await call();
    } catch (error) {
      reportError(title, error);
      runInAction(
        () => (this.result = { title, message: error instanceof Error ? error.message : String(error), isError: true }),
      );
      return null;
    } finally {
      runInAction(() => (this.busy = null));
    }
  }

  private showValidation(title: string, validation: IDriverValidationResult): void {
    runInAction(() => (this.result = { title, validation }));
  }

  async view(entry: IDriverListEntry): Promise<void> {
    const bundle = await this.run('view', 'Failed to read the driver', () =>
      globalThis.falang.drivers.get(entry.config.id, entry.scope),
    );
    if (bundle) runInAction(() => (this.viewing = { id: entry.config.id, scope: entry.scope, bundle }));
  }

  async validate(entry: IDriverListEntry, scope: TDriverEditScope): Promise<void> {
    const validation = await this.run('validate', 'Failed to validate the driver', async () => {
      const bundle = await globalThis.falang.drivers.get(entry.config.id, entry.scope);
      return globalThis.falang.drivers.validate(bundle, scope);
    });
    if (validation) this.showValidation(`Validation: ${entry.config.id}`, validation);
  }

  async download(entry: IDriverListEntry): Promise<void> {
    const outcome = await this.run('download', 'Failed to download the driver', () =>
      globalThis.falang.drivers.exportBundle(entry.config.id, entry.scope),
    );
    if (outcome && !outcome.canceled) {
      runInAction(() => (this.result = { title: 'Downloaded', message: outcome.path }));
    }
  }

  async openFolder(entry: IDriverListEntry): Promise<void> {
    const error = await this.run('open-folder', 'Failed to open the driver folder', () =>
      globalThis.falang.drivers.openFolder(entry.config.id, entry.scope),
    );
    if (error) runInAction(() => (this.result = { title: 'Open folder', message: error, isError: true }));
  }

  async saveToLibrary(entry: IDriverListEntry): Promise<void> {
    const validation = await this.run('save', 'Failed to save to the library', () =>
      globalThis.falang.drivers.saveToLibrary(entry.config.id),
    );
    if (validation) this.showValidation(`Save to library: ${entry.config.id}`, validation);
  }

  async addFromLibrary(entry: IDriverListEntry): Promise<void> {
    const validation = await this.run('save', 'Failed to add the driver to the project', () =>
      globalThis.falang.drivers.addFromLibrary(entry.config.id),
    );
    if (validation) this.showValidation(`Add to project: ${entry.config.id}`, validation);
  }

  async replaceWithLibrary(entry: IDriverListEntry): Promise<void> {
    const validation = await this.run('save', 'Failed to replace the driver', () =>
      globalThis.falang.drivers.replaceWithLibrary(entry.config.id),
    );
    if (validation) this.showValidation(`Replace with library version: ${entry.config.id}`, validation);
  }

  async delete(entry: IDriverListEntry, scope: TDriverEditScope): Promise<void> {
    const outcome = await this.run('delete', 'Failed to delete the driver', () =>
      globalThis.falang.drivers.delete(entry.config.id, scope),
    );
    if (outcome && !outcome.deleted) {
      runInAction(
        () =>
          (this.result = {
            title: `Cannot delete ${entry.config.id}`,
            message: 'The driver is still used by the project — remove these first:',
            usages: outcome.usages,
            isError: true,
          }),
      );
    }
  }

  async uploadBundle(scope: TDriverEditScope): Promise<void> {
    const outcome = await this.run('save', 'Failed to upload the bundle', () =>
      globalThis.falang.drivers.importBundleFile(scope),
    );
    if (outcome && !outcome.canceled)
      this.showValidation(`Upload bundle${outcome.id ? `: ${outcome.id}` : ''}`, outcome.validation);
  }

  async importFolder(scope: TDriverEditScope): Promise<void> {
    const dir = await globalThis.falang.dialog.openProjectFolder();
    if (!dir) return;
    const validation = await this.run('save', 'Failed to import the folder', () =>
      globalThis.falang.drivers.importFolder(dir, scope),
    );
    if (validation) this.showValidation(`Import folder: ${dir}`, validation);
  }

  /** Returns an error message for an invalid id (nothing is sent), else runs the call and returns `null`. */
  async createFromTemplate(id: string, label: string): Promise<string | null> {
    if (!DRIVER_ID_PATTERN.test(id))
      return 'The id must be kebab-case: lowercase letters, digits and dashes, starting with a letter.';
    if (label.trim() === '') return 'The label is required.';
    const outcome = await this.run('save', 'Failed to create the driver', () =>
      globalThis.falang.drivers.createFromTemplate(id, label.trim()),
    );
    if (outcome) {
      runInAction(() => (this.isTemplateFormOpen = false));
      this.showValidation(`New driver: ${id}`, outcome.validation);
    }
    return null;
  }
}

export const driversModalStore = new DriversModalStore();

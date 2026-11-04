/* oxlint-disable no-undefined, no-negated-condition, no-nested-ternary, unicorn/no-nested-ternary */
/**
 * Electron-free core of the managed arduino-cli handlers (ADR 0074 (private) §2-§3): settings merging,
 * status derivation, install/update orchestration over injected dependencies, so the IPC file stays glue.
 */
import * as path from 'node:path';
import {
  checkForArduinoCliUpdate,
  cleanupManagedVersions,
  compareVersions,
  installManagedArduinoCli,
  readArduinoCliSettings,
  writeArduinoCliSettings,
} from '@falang/desktop-arduino-cli';
import type { IArduinoCliSettings, IManagedInstallProgress, TManagedFetch } from '@falang/desktop-arduino-cli';
import type {
  IArduinoCliCheckUpdatesResult,
  IArduinoCliSettingsInput,
  TArduinoCliInstallResult,
} from '../shared/arduino-cli-ipc-types.js';
import type { TArduinoCliOperationKind } from './arduino-cli-busy-error.js';

/** Where managed versions live: `<userData>/arduino-cli/<version>/`. */
export const managedRootDir = (userDataDir: string): string => path.join(userDataDir, 'arduino-cli');

/** Merges the renderer's input onto the stored settings so `managed`/`lastUpdateCheck` can never be dropped by it. */
export const mergeArduinoCliSettings = (
  current: IArduinoCliSettings,
  input: IArduinoCliSettingsInput,
): IArduinoCliSettings => ({
  ...current,
  source: input.source,
  ...(typeof input.customPath === 'string' && input.customPath !== '' ? { customPath: input.customPath } : {}),
  ...(typeof input.checkUpdates === 'boolean' ? { checkUpdates: input.checkUpdates } : {}),
});

export interface IManagedStatus {
  readonly managedVersion?: string;
  readonly latestVersion?: string;
  readonly updateAvailable?: boolean;
}

const isNewer = (latest: string, installed: string): boolean => {
  try {
    return compareVersions(latest, installed) > 0;
  } catch {
    return false;
  }
};

export const deriveManagedStatus = (settings: IArduinoCliSettings): IManagedStatus => {
  const installed = settings.managed?.version;
  const latest = settings.lastUpdateCheck?.latest;
  return {
    ...(installed !== undefined ? { managedVersion: installed } : {}),
    ...(settings.source === 'managed' && latest !== undefined
      ? {
          latestVersion: latest,
          updateAvailable: installed !== undefined && isNewer(latest, installed),
        }
      : {}),
  };
};

export interface IManagedCliDeps {
  readonly settingsFile: string;
  readonly rootDir: string;
  readonly fetch: TManagedFetch;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly underArm64Translation: boolean;
  readonly runExclusive: <T>(kind: TArduinoCliOperationKind, fn: () => Promise<T>) => Promise<T>;
  readonly onProgress: (progress: IManagedInstallProgress) => void;
  readonly onChanged: () => void;
  readonly now?: () => Date;
}

export class ManagedArduinoCli {
  private readonly deps: IManagedCliDeps;
  private controller: AbortController | null = null;
  private cancelled = false;

  constructor(deps: IManagedCliDeps) {
    this.deps = deps;
  }

  /** Downloads and installs `version` (else the latest), then switches the source to `managed`. Never throws. */
  async install(version?: string): Promise<TArduinoCliInstallResult> {
    try {
      return await this.deps.runExclusive('cli-install', async () => {
        const controller = new AbortController();
        this.controller = controller;
        this.cancelled = false;
        try {
          const installed = await installManagedArduinoCli({
            ...(version !== undefined ? { version } : {}),
            rootDir: this.deps.rootDir,
            fetch: this.deps.fetch,
            platform: this.deps.platform,
            arch: this.deps.arch,
            underArm64Translation: this.deps.underArm64Translation,
            onProgress: this.deps.onProgress,
            signal: controller.signal,
          });
          const current = await readArduinoCliSettings(this.deps.settingsFile);
          await writeArduinoCliSettings(this.deps.settingsFile, {
            ...current,
            source: 'managed',
            managed: {
              version: installed.version,
              path: installed.path,
              installedAt: (this.deps.now?.() ?? new Date()).toISOString(),
            },
          });
          await cleanupManagedVersions(this.deps.rootDir, installed.version);
          this.deps.onChanged();
          return { ok: true as const, version: installed.version };
        } finally {
          this.controller = null;
        }
      });
    } catch (error) {
      return {
        ok: false,
        message: this.cancelled ? 'Cancelled.' : error instanceof Error ? error.message : String(error),
        ...(this.cancelled ? { cancelled: true as const } : {}),
      };
    }
  }

  cancelInstall(): void {
    if (this.controller === null) return;
    this.cancelled = true;
    this.controller.abort();
  }

  /** Persists `lastUpdateCheck` when a request really went out; never throws. */
  async checkUpdates(force = false): Promise<IArduinoCliCheckUpdatesResult> {
    try {
      const settings = await readArduinoCliSettings(this.deps.settingsFile);
      const result = await checkForArduinoCliUpdate({
        settings,
        now: this.deps.now?.() ?? new Date(),
        fetch: this.deps.fetch,
        force,
      });
      if (result.checked && result.lastUpdateCheck) {
        await writeArduinoCliSettings(this.deps.settingsFile, { ...settings, lastUpdateCheck: result.lastUpdateCheck });
        this.deps.onChanged();
      }
      return {
        checked: result.checked,
        ...(result.latest !== undefined ? { latest: result.latest } : {}),
        ...(result.updateAvailable !== undefined ? { updateAvailable: result.updateAvailable } : {}),
      };
    } catch {
      return { checked: false };
    }
  }
}

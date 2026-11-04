import type { IArduinoCliSettings, IArduinoCliStatus } from '@falang/desktop-arduino-cli';

/** Which exclusive operation holds the CLI (mirror of `main/arduino-cli-operations.ts`; the renderer never imports `main`). */
export type TArduinoCliBusyKind = 'build' | 'upload' | 'debug-upload' | 'cli-install' | 'core-install';

/** `arduino-cli:get-status` — the resolved CLI plus whether an exclusive operation is running. */
export interface IArduinoCliFullStatus extends IArduinoCliStatus {
  readonly busy: TArduinoCliBusyKind | null;
  /** The installed managed copy's version (the settings' `managed.version`), when there is one. */
  readonly managedVersion?: string;
  /** From the cached last update check (managed source only). */
  readonly latestVersion?: string;
  readonly updateAvailable?: boolean;
}

/** What the renderer may send to `arduino-cli:set-settings`; the stored `managed`/`lastUpdateCheck` are never overwritten by it. */
export interface IArduinoCliSettingsInput {
  readonly source: IArduinoCliSettings['source'];
  readonly customPath?: string;
  readonly checkUpdates?: boolean;
}

/** `arduino-cli:install` never throws across IPC. */
export type TArduinoCliInstallResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly message: string; readonly cancelled?: true };

/** `arduino-cli:check-updates` — `checked: false` means nothing was asked of the network or it failed. */
export interface IArduinoCliCheckUpdatesResult {
  readonly checked: boolean;
  readonly latest?: string;
  readonly updateAvailable?: boolean;
}

/** Event `arduino-cli:progress` (throttled to ~10 per second). */
export interface IArduinoCliProgress {
  readonly phase: 'download';
  readonly received: number;
  readonly total?: number;
}

/** `arduino-cli:set-settings` never throws across IPC: a refusal is an `ok: false` with a message. */
export type TArduinoCliSetSettingsResult =
  | { readonly ok: true; readonly settings: IArduinoCliSettings }
  | { readonly ok: false; readonly message: string };

/** Payload of the `arduino-cli:changed` event (settings or busy state changed). */
export interface IArduinoCliChangedPayload {
  readonly busy: TArduinoCliBusyKind | null;
}

import type { IArduinoCliSettings, IArduinoCliStatus } from '@falang/desktop-arduino-cli';

/** Which exclusive operation holds the CLI (mirror of `main/arduino-cli-operations.ts`; the renderer never imports `main`). */
export type TArduinoCliBusyKind = 'build' | 'upload' | 'debug-upload' | 'cli-install' | 'core-install';

/** `arduino-cli:get-status` — the resolved CLI plus whether an exclusive operation is running. */
export interface IArduinoCliFullStatus extends IArduinoCliStatus {
  readonly busy: TArduinoCliBusyKind | null;
}

/** `arduino-cli:set-settings` never throws across IPC: a refusal is an `ok: false` with a message. */
export type TArduinoCliSetSettingsResult =
  | { readonly ok: true; readonly settings: IArduinoCliSettings }
  | { readonly ok: false; readonly message: string };

/** Payload of the `arduino-cli:changed` event (settings or busy state changed). */
export interface IArduinoCliChangedPayload {
  readonly busy: TArduinoCliBusyKind | null;
}

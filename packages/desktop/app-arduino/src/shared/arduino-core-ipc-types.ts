/** Board-core IPC (`falang.arduinoCores.*`, ADR 0074 (private) §4). Mirrors only plain data — the renderer never imports `main`. */

/** `arduino-cores:status` — whether the core a board's `fqbn` needs is installed. */
export interface IArduinoCoreStatus {
  /** `arduino:avr`; `null` for a malformed `fqbn`. */
  readonly platformId: string | null;
  readonly boardLabel: string;
  readonly installed: boolean;
  readonly version?: string;
  /** The Boards Manager index the install passes as `--additional-urls` (absent for `arduino:*` cores). */
  readonly packageIndexUrl?: string;
  /** `false` when no usable `arduino-cli` was found (then `installed` means nothing). */
  readonly cliAvailable: boolean;
  /** Why the installed list could not be read although the CLI exists. */
  readonly error?: string;
}

/** `arduino-cores:install` never throws across IPC. */
export interface IArduinoCoreInstallResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  readonly message?: string;
}

/** One line of the `arduino-cores:output` event streamed during an install. */
export interface IArduinoCoreOutputLine {
  readonly line: string;
  readonly stream: 'stdout' | 'stderr';
}

/** A Build/Upload/Upload (debug) refused because the project board's core is not installed. */
export interface IArduinoCoreMissingOutcome {
  readonly stage: 'core-missing';
  readonly platformId: string;
  readonly boardLabel: string;
  /** Ready to show as plain text. */
  readonly message: string;
}

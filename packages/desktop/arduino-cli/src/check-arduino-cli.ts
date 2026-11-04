import { isSerialMonitorSupported } from './monitor-port.js';
import { resolveArduinoCliDetailed } from './resolve-arduino-cli.js';
import type { TArduinoCliProblem, TArduinoCliResolvedSource } from './resolve-arduino-cli.js';
import { runArduinoCli } from './run-arduino-cli.js';

export interface IArduinoCliStatus {
  readonly available: boolean;
  readonly version?: string;
  /** The binary that answered (`resolveArduinoCli`) — shown so a user can tell which install is used. */
  readonly path?: string;
  /** Where the binary came from (ADR 0074 (private)). */
  readonly source: TArduinoCliResolvedSource;
  /** Why resolution found nothing usable (`not-found`, `custom-missing`, `managed-missing`). */
  readonly problem?: TArduinoCliProblem;
  /** Whether "Upload (debug)" can work: the serial port addon loads (see `isSerialMonitorSupported`). */
  readonly serialMonitorSupported: boolean;
}

/** `VersionString` of `arduino-cli version --json`; the trimmed raw text when it isn't JSON (older CLIs). */
export const parseArduinoCliVersion = (output: string): string => {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const version = (parsed as { VersionString?: unknown }).VersionString;
      if (typeof version === 'string' && version !== '') return version;
    }
  } catch {
    // not JSON — fall through
  }
  return output.trim();
};

/** Used when the build panel opens, for an onboarding notice when `arduino-cli` can't be found, the same posture `0007-falangflow-desktop-electron-workflow-app.md`'s `check-docker` established for a missing Docker daemon. */
export const checkArduinoCli = async (): Promise<IArduinoCliStatus> => {
  const serialMonitorSupported = await isSerialMonitorSupported();
  const resolution = await resolveArduinoCliDetailed();
  const result = await runArduinoCli(['version', '--json']);
  if (!result.ok) {
    return {
      available: false,
      source: resolution.source,
      ...(resolution.problem ? { problem: resolution.problem } : {}),
      serialMonitorSupported,
    };
  }
  return {
    available: true,
    version: parseArduinoCliVersion(result.output),
    path: resolution.path,
    source: resolution.source,
    serialMonitorSupported,
  };
};

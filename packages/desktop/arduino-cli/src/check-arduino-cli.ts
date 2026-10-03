import { isSerialMonitorSupported } from './monitor-port.js';
import { resolveArduinoCli } from './resolve-arduino-cli.js';
import { runArduinoCli } from './run-arduino-cli.js';

export interface IArduinoCliStatus {
  readonly available: boolean;
  readonly version?: string;
  /** The binary that answered (`resolveArduinoCli`) — shown so a user can tell which install is used. */
  readonly path?: string;
  /** Whether "Upload (debug)" can work on this OS (see `isSerialMonitorSupported`). */
  readonly serialMonitorSupported: boolean;
}

/** Used when the build panel opens, for an onboarding notice when `arduino-cli` can't be found, the same posture `0007-falangflow-desktop-electron-workflow-app.md`'s `check-docker` established for a missing Docker daemon. */
export const checkArduinoCli = async (): Promise<IArduinoCliStatus> => {
  const serialMonitorSupported = isSerialMonitorSupported();
  const result = await runArduinoCli(['version']);
  if (!result.ok) return { available: false, serialMonitorSupported };
  return { available: true, version: result.output.trim(), path: await resolveArduinoCli(), serialMonitorSupported };
};

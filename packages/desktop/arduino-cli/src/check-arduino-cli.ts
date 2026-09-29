import { runArduinoCli } from './run-arduino-cli.js';

export interface IArduinoCliStatus {
  readonly available: boolean;
  readonly version?: string;
}

/** Used at app startup for an onboarding screen when `arduino-cli` isn't on the host's `PATH`, the same posture `0007-falangflow-desktop-electron-workflow-app.md`'s `check-docker` established for a missing Docker daemon. */
export const checkArduinoCli = async (): Promise<IArduinoCliStatus> => {
  const result = await runArduinoCli(['version']);
  if (!result.ok) return { available: false };
  return { available: true, version: result.output.trim() };
};

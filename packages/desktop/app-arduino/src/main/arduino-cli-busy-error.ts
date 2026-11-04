export type TArduinoCliOperationKind = 'build' | 'upload' | 'debug-upload' | 'cli-install' | 'core-install';

/** Thrown by `runExclusive` when another exclusive operation is running; the message is user-readable. */
export class ArduinoCliBusyError extends Error {
  readonly running: TArduinoCliOperationKind;
  readonly requested: TArduinoCliOperationKind;

  constructor(running: TArduinoCliOperationKind, requested: TArduinoCliOperationKind) {
    super(`Cannot start ${requested}: ${running} is already running. Wait for it to finish.`);
    this.name = 'ArduinoCliBusyError';
    this.running = running;
    this.requested = requested;
  }
}

import type { ICreateProjectParams } from '@falang/desktop-project-fs';

/**
 * `IPC.projectCreate`'s params for this app — the same `{ name, type }` `project-fs` itself knows
 * about, plus the board `fqbn` chosen once in the "New Project…" dialog (see
 * ADR 0032 (private), "Decision → 1"). The board isn't part of
 * `project-fs`'s own domain-agnostic manifest — it's written separately to
 * `falang/config/arduino.json` right after `createProject` (see `main/arduino-project-config.ts`),
 * the same "own file under `falang/config/`" pattern `@falang/logic-export`'s `logic-export.json`
 * already uses.
 */
export interface ICreateArduinoProjectParams extends ICreateProjectParams {
  readonly board: string;
}

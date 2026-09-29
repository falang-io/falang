import { promises as fs } from 'node:fs';
import { configDir, configFilePath } from '@falang/desktop-project-fs';
import type { IArduinoProjectConfig } from '../shared/board.js';

/**
 * Where a project's chosen board lives on disk: `<projectDir>/falang/config/arduino.json` (the same
 * `falang/config/` mechanism `@falang/logic-export`'s `logic-export.json` uses — see
 * `configFilePath`'s own doc comment and ADR 0032 (private)'s
 * "Decision → 1"). A domain-specific file of its own, not a field on `project-fs`'s manifest, for the
 * same reason `logic-export.json` isn't: `project-fs` stays fully domain-agnostic and rebuilds the
 * manifest from known fields only, so any extra field there would be silently dropped on the next
 * folder/document change.
 */
export const ARDUINO_PROJECT_CONFIG_FILENAME = 'arduino.json';

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

const isArduinoProjectConfig = (value: unknown): value is IArduinoProjectConfig =>
  typeof value === 'object' && value !== null && typeof (value as { board?: unknown }).board === 'string';

/**
 * `null` for a project with no `arduino.json` yet (never created under ADR 0032 (private), or a
 * pre-existing project not yet opened since) — the `IPC.projectOpen` handler treats that as
 * `DEFAULT_BOARD_FQBN` and writes the file so the project is bound from then on. A corrupt (present
 * but unparsable, or parsable but missing `board`) file also reads as `null` rather than throwing —
 * same "never block opening the project over this" posture, since the board is metadata, not part of
 * the tree itself.
 */
export const readArduinoProjectConfig = async (projectDir: string): Promise<IArduinoProjectConfig | null> => {
  // oxlint-disable-next-line init-declarations -- assigned in the try block immediately below
  let raw: string;
  try {
    raw = await fs.readFile(configFilePath(projectDir, ARDUINO_PROJECT_CONFIG_FILENAME), 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
  // oxlint-disable-next-line init-declarations -- assigned in the try block immediately below
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isArduinoProjectConfig(parsed) ? parsed : null;
};

export const writeArduinoProjectConfig = async (projectDir: string, config: IArduinoProjectConfig): Promise<void> => {
  await fs.mkdir(configDir(projectDir), { recursive: true });
  await fs.writeFile(configFilePath(projectDir, ARDUINO_PROJECT_CONFIG_FILENAME), JSON.stringify(config, null, 2));
};

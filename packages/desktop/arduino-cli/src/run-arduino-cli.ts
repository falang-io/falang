import { execFileAsync } from './exec-file-async.js';

export interface IArduinoCliResult {
  readonly ok: boolean;
  readonly output: string;
}

const joinNonEmpty = (parts: readonly string[]): string => parts.filter((part) => part !== '').join('\n');

/** Runs one `arduino-cli` subcommand, always resolving (never rejecting) with a combined stdout/stderr — callers don't need their own try/catch per call. Not exported from `index.ts`: `compileSketch`/`uploadSketch`/`listBoards`/`checkArduinoCli` are the public shape, this is their shared plumbing. */
export const runArduinoCli = async (args: readonly string[]): Promise<IArduinoCliResult> => {
  const outcome = await execFileAsync('arduino-cli', args);
  const combined = joinNonEmpty([outcome.stdout, outcome.stderr]);
  if (outcome.ok) return { ok: true, output: combined };
  return { ok: false, output: combined === '' ? (outcome.errorMessage ?? '') : combined };
};

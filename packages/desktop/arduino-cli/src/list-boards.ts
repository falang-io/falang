import { runArduinoCli } from './run-arduino-cli.js';

export interface IConnectedBoard {
  readonly port: string;
  readonly fqbn?: string;
  readonly boardName?: string;
}

interface IBoardListJsonEntry {
  readonly port?: { readonly address?: string };
  readonly matching_boards?: readonly { readonly name?: string; readonly fqbn?: string }[];
}

/**
 * `arduino-cli board list --format json`'s real top-level shape (confirmed against a real
 * `arduino-cli 1.3.0` install — this package had never been live-verified against a real binary
 * before, see ADR 0020 (private)'s own "no hardware/arduino-cli binary available" disclaimer):
 * `{ detected_ports: [...], warnings: [...] }`, not a bare array of entries. `detected_ports` is
 * optional in the type only as a defensive measure against a future CLI version dropping it when
 * empty — every real response observed so far includes it, even as `[]`.
 */
interface IBoardListJson {
  readonly detected_ports?: readonly IBoardListJsonEntry[];
}

const toConnectedBoard = (entry: IBoardListJsonEntry): IConnectedBoard | null => {
  const address = entry.port?.address;
  if (!address) return null;
  const board = entry.matching_boards?.[0];
  return { port: address, fqbn: board?.fqbn, boardName: board?.name };
};

/** A port with no `matching_boards` entry still comes back (with `fqbn`/`boardName` left unset) rather than being dropped — Phase 1's board picker is a short hardcoded FQBN list the user chooses from manually (see ADR 0020 (private)), so an unrecognized port is still a valid upload target, just without an auto-filled hint. Only a port with no address at all (malformed entry) is dropped. */
export const listBoards = async (): Promise<readonly IConnectedBoard[]> => {
  const result = await runArduinoCli(['board', 'list', '--format', 'json']);
  if (!result.ok) throw new Error(`arduino-cli board list failed: ${result.output}`);
  const parsed = JSON.parse(result.output) as IBoardListJson;
  const entries = parsed.detected_ports ?? [];
  return entries.map((entry) => toConnectedBoard(entry)).filter((board): board is IConnectedBoard => board !== null);
};

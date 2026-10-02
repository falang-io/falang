import { loadDriverRegistryFromDirs, type IDriverConfig, type IDriverLoadError } from '@falang/desktop-arduino-dto';
import type { DocumentStackRegistry } from '@falang/mcp-core';
import { registerArduinoStack } from './arduino-drivers-state.js';

/**
 * `packages/desktop/app-arduino` writes `falang.json`'s `type` as `'arduino'` and every *scheme*
 * document in an Arduino project (`setup`, `loop`, any further function a user adds) is document type
 * `'function'` — see ADR 0029 (private)'s phase A `README.md`, "What isn't
 * registered here". `@falang/mcp-core`'s own `createDefaultDocumentStackRegistry()` can't build this
 * stack itself (the pin/driver node kinds live in an app package, not a `*-dto` package), so the
 * desktop stdio host registers it via the same `registerProjectType` seam.
 *
 * Since ADR 0032 (private), an Arduino project also has one
 * `'devices'` *custom* document (`data`, no `root` — pins/hardware, see that ADR's "Decision → 3").
 * It's deliberately **not** registered here: `DocumentStackRegistry`/`applySetDocument` are node-tree-
 * only (a `NodesStack` + a default root), so `set_document` on the `devices` document is unsupported
 * for now (an unknown-document-type error, same as any other unregistered type) — a documented
 * out-of-scope follow-up, not a bug. `rename_document`/`move_document`/`delete_document` still guard
 * it correctly regardless (see `handlers.ts`'s `findPinnedArduinoDocumentError`, which reads the
 * on-disk tree rather than this registry), since it's pinned and refuses those calls before any
 * registry lookup would matter.
 */
export const ARDUINO_PROJECT_TYPE = 'arduino';
export const ARDUINO_FUNCTION_DOCUMENT_TYPE = 'function';

export interface IRegisterArduinoProjectTypeResult {
  /** Driver folders under a `driversDirs` entry that failed to load (bad `driver.config.json`, missing source files, …) — reported so the host can log them, never fatal (see `loadDriverRegistryFromDirs`'s own "skipped, not fatal" behavior). */
  readonly driverErrors: readonly IDriverLoadError[];
  readonly driverCount: number;
}

/**
 * Registers `'arduino'`'s one document type (`'function'`) onto `registry`, combining
 * `@falang/typescript-dto`'s `functionNodesGroup` (the same one the `'logic'`/`'workflow'` `function`
 * document types use) with the Electron-free pin node configs and every `driver-action::…` node
 * config derived from the driver folders found under `driversDirs` (bundled + user, in the order
 * given — a later directory's same-id driver wins, see `loadDriverRegistryFromDirs`).
 */
export const registerArduinoProjectType = async (
  registry: DocumentStackRegistry,
  driversDirs: readonly string[],
): Promise<IRegisterArduinoProjectTypeResult> => {
  const { drivers, errors } = await loadDriverRegistryFromDirs(driversDirs);
  const driverConfigs: readonly IDriverConfig[] = drivers.map((driver) => driver.config);
  registerArduinoStack(registry, driverConfigs);
  return { driverCount: driverConfigs.length, driverErrors: errors };
};

import { findDriverUsages } from '@falang/desktop-arduino-compiler';
import type { IDriverConfig } from '@falang/desktop-arduino-dto';
import type { IDriverValidationProject } from '@falang/desktop-arduino-compiler/src/driver-validation-types.js';
import type { IDriverListEntry, TDriverScope } from '../../shared/driver-ipc-types.js';

export interface IReferencedMissingParams {
  /** The drivers served so far, by id — entries are added for referenced-but-missing drivers. */
  readonly byId: Map<string, { entry: IDriverListEntry; dir: string }>;
  /** `<scope>:<id>` keys found on disk this reload — extended with the kept ones so their last-valid memory survives. */
  readonly seen: Set<string>;
  readonly lastValid: ReadonlyMap<string, { readonly config: IDriverConfig; readonly dir: string }>;
  readonly projectDir: string | null;
  readonly readProjectContext: (projectDir: string) => Promise<IDriverValidationProject | null>;
}

/**
 * A driver whose folder vanished (deleted externally, a git checkout) while the project still uses it keeps being
 * served — last valid config, status `missing-on-disk` — so open schemes never meet an unknown node kind and a build is
 * blocked; an unreferenced one (or one another scope still provides) simply disappears (ADR 0054 (private) §5).
 */
export const keepReferencedMissing = async (params: IReferencedMissingParams): Promise<void> => {
  const { byId, seen, lastValid, projectDir } = params;
  const candidates = [...lastValid.entries()].filter(([key]) => {
    if (seen.has(key)) return false;
    const [scope, ...rest] = key.split(':');
    return scope !== 'bundled' && !byId.has(rest.join(':'));
  });
  if (candidates.length === 0 || projectDir === null) return;
  const context = await params.readProjectContext(projectDir).catch(() => null);
  if (!context) return;
  for (const [key, previous] of candidates) {
    const [scope, ...rest] = key.split(':');
    const id = rest.join(':');
    if (findDriverUsages(id, context).length === 0) continue;
    seen.add(key);
    byId.set(id, {
      dir: previous.dir,
      entry: {
        config: previous.config,
        errors: [`The folder of driver "${id}" is gone from disk but the project still uses it`],
        scope: scope as TDriverScope,
        status: 'missing-on-disk',
      },
    });
  }
};

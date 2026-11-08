import {
  coerceConstantValue,
  CONSTANT_TYPES,
  defaultConstantValue,
  normalizeConstantsDocumentData,
  type IConstantsDocumentData,
  type IWorkflowConstant,
  type TConstantType,
} from './constants-document.js';

/** One upsert of `applyConstantChanges`: by `name`; `newName` renames; omitted fields keep (or default) their value. */
export interface IConstantUpsert {
  name: string;
  newName?: string;
  type?: TConstantType;
  dev?: unknown;
  prod?: unknown;
}

export interface IConstantChanges {
  set?: readonly IConstantUpsert[];
  delete?: readonly string[];
}

export type TApplyConstantChangesResult =
  | { readonly ok: true; readonly data: IConstantsDocumentData }
  | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConstantType = (value: unknown): value is TConstantType =>
  typeof value === 'string' && (CONSTANT_TYPES as readonly string[]).includes(value);

const hasKey = (record: Record<string, unknown>, key: string): boolean => Object.hasOwn(record, key);

/** One `set` entry of a tool call, or the reason it is malformed. */
const parseUpsert = (item: unknown, index: number): IConstantUpsert | string => {
  if (!isRecord(item) || typeof item.name !== 'string') return `set[${index}]: needs a "name"`;
  if (hasKey(item, 'type') && !isConstantType(item.type)) {
    return `set[${index}] (${item.name}): "type" must be one of ${CONSTANT_TYPES.join(', ')}`;
  }
  if (hasKey(item, 'newName') && typeof item.newName !== 'string') {
    return `set[${index}] (${item.name}): "newName" must be a string`;
  }
  const upsert: IConstantUpsert = { name: item.name };
  if (typeof item.newName === 'string') upsert.newName = item.newName;
  if (isConstantType(item.type)) upsert.type = item.type;
  if (hasKey(item, 'dev')) upsert.dev = item.dev;
  if (hasKey(item, 'prod')) upsert.prod = item.prod;
  return upsert;
};

/** Parses the untyped input of a tool (an agent call, an MCP call) into `IConstantChanges`, or lists what is wrong. */
export const parseConstantChanges = (
  input: unknown,
): { ok: true; changes: IConstantChanges } | { ok: false; errors: string[] } => {
  if (!isRecord(input)) return { ok: false, errors: ['Expected an object with "set" and/or "delete"'] };
  const errors: string[] = [];
  const set: IConstantUpsert[] = [];
  if (hasKey(input, 'set') && !Array.isArray(input.set)) errors.push('"set" must be a list');
  for (const [index, item] of (Array.isArray(input.set) ? input.set : []).entries()) {
    const upsert = parseUpsert(item, index);
    if (typeof upsert === 'string') errors.push(upsert);
    else set.push(upsert);
  }
  const remove: unknown = input.delete ?? [];
  if (!Array.isArray(remove) || remove.some((name: unknown) => typeof name !== 'string')) {
    errors.push('"delete" must be a list of names');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, changes: { set, delete: remove as string[] } };
};

/**
 * Applies upserts and deletions to the current constants, all or nothing: deletions first, then each upsert — an
 * existing name is updated (a new `type` converts the values it keeps), a new name is created (it needs a `type`;
 * missing values start empty). The result is validated like a saved document; ids are kept, new ones come from
 * `createId`.
 */
export const applyConstantChanges = (
  current: readonly IWorkflowConstant[],
  changes: IConstantChanges,
  createId: () => string,
): TApplyConstantChangesResult => {
  const errors: string[] = [];
  const toDelete = new Set(changes.delete);
  for (const name of toDelete) {
    if (!current.some((constant) => constant.name === name)) errors.push(`delete: no constant named "${name}"`);
  }
  const next: IWorkflowConstant[] = current.filter((constant) => !toDelete.has(constant.name));
  for (const upsert of changes.set ?? []) {
    const index = next.findIndex((constant) => constant.name === upsert.name);
    const existing = index === -1 ? null : next[index];
    if (!existing && !upsert.type) {
      errors.push(`set (${upsert.name}): a new constant needs a "type" (${CONSTANT_TYPES.join(', ')})`);
      continue;
    }
    const type = upsert.type ?? (existing as IWorkflowConstant).type;
    const valueOf = (env: 'dev' | 'prod') => {
      if (Object.hasOwn(upsert, env)) return upsert[env];
      return existing ? coerceConstantValue(type, existing[env]) : defaultConstantValue(type);
    };
    const updated = {
      id: existing?.id ?? createId(),
      name: upsert.newName ?? upsert.name,
      type,
      dev: valueOf('dev'),
      prod: valueOf('prod'),
    } as IWorkflowConstant;
    if (existing) next[index] = updated;
    else next.push(updated);
  }
  if (errors.length > 0) return { ok: false, errors };
  const normalized = normalizeConstantsDocumentData({ constants: next });
  return normalized.ok ? { ok: true, data: normalized.data } : { ok: false, errors: [...normalized.errors] };
};

/** The constants as a tool shows them: no row ids. */
export const describeConstantsForTool = (
  constants: readonly IWorkflowConstant[],
): { name: string; type: TConstantType; dev: unknown; prod: unknown }[] =>
  constants.map(({ name, type, dev, prod }) => ({ name, type, dev, prod }));

/** Tool description text shared by the in-app agent and MCP. */
export const SET_CONSTANTS_DESCRIPTION =
  "Creates, updates, renames and deletes the project's constants in one all-or-nothing call. `set` upserts by " +
  '`name`: an existing constant keeps whatever you leave out (a new `type` converts its values), a new one needs ' +
  '`type` (string | number | boolean) and gets empty values for a missing `dev`/`prod`; `newName` renames. ' +
  'Names are UPPER_SNAKE_CASE: capital letters, digits and "_", starting with a letter. `dev` is the value on the ' +
  'test stand, `prod` in published versions; values must match the type (a number, true/false). `delete` lists ' +
  'names to remove. Renaming or deleting a constant does not update code that uses it — fix those fields too. ' +
  'Never put secrets (tokens, passwords) into constants: they are plain, versioned, exported project data.';

export const LIST_CONSTANTS_DESCRIPTION =
  "Read-only. Lists the project's constants (name, type, dev and prod value). Constants are global read-only " +
  'identifiers in every code field (`${API_URL}`, `LIMIT * 2`); the dev stand runs with the dev values, a ' +
  'published version with the prod values.';

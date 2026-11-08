/**
 * The pinned `constants` document of a workflow project: named values with one value for the dev stand and one for
 * production (like `Integrations`, one per project, at the root, never deleted). Every code field of the project sees
 * them as global identifiers (`SOME_CONSTANT_NAME`); the compiler writes the values of the environment it builds for
 * into the workflows module — dev for a dev build, prod for a published version.
 * Browser-safe: no `node:*`, no `process.env`, no `Buffer`.
 */

export const CONSTANTS_DOCUMENT_TYPE = 'constants';

/** Stored name of the pinned document (the UI shows a localised label). */
export const CONSTANTS_DOCUMENT_NAME = 'Constants';

export const CONSTANT_TYPES = ['string', 'number', 'boolean'] as const;
export type TConstantType = (typeof CONSTANT_TYPES)[number];

export type TConstantValue = string | number | boolean;

export type TConstantEnv = 'dev' | 'prod';

export interface IWorkflowConstant {
  /** Stable row id (survives renames). */
  id: string;
  /** `SOME_CONSTANT_NAME`: capital letters, digits and `_`, starting with a letter. */
  name: string;
  type: TConstantType;
  dev: TConstantValue;
  prod: TConstantValue;
}

export interface IConstantsDocumentData {
  constants: IWorkflowConstant[];
}

export const CONSTANT_NAME_RE = /^[A-Z][A-Z0-9_]*$/;
export const CONSTANT_NAME_MAX_LENGTH = 64;
export const CONSTANT_STRING_MAX_LENGTH = 10_000;
export const CONSTANTS_MAX_COUNT = 500;

/** Upper-case globals of the code fields' lib a constant must not shadow. */
export const CONSTANT_RESERVED_NAMES: ReadonlySet<string> = new Set(['JSON']);

export const emptyConstantsData = (): IConstantsDocumentData => ({ constants: [] });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConstantType = (value: unknown): value is TConstantType =>
  typeof value === 'string' && (CONSTANT_TYPES as readonly string[]).includes(value);

/** The reason `name` is not a valid constant name, or `null`. */
export const validateConstantName = (name: string): string | null => {
  if (name === '') return 'A constant needs a name';
  if (name.length > CONSTANT_NAME_MAX_LENGTH)
    return `A constant name is at most ${CONSTANT_NAME_MAX_LENGTH} characters`;
  if (!CONSTANT_NAME_RE.test(name)) {
    return `"${name}" is not a valid constant name: use capital letters, digits and "_", starting with a letter (SOME_CONSTANT_NAME)`;
  }
  if (CONSTANT_RESERVED_NAMES.has(name)) return `"${name}" is reserved`;
  return null;
};

/** The reason `value` is not a value of `type`, or `null`. */
export const validateConstantValue = (type: TConstantType, value: unknown): string | null => {
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') return 'must be a string';
      return value.length > CONSTANT_STRING_MAX_LENGTH
        ? `is longer than ${CONSTANT_STRING_MAX_LENGTH} characters`
        : null;
    }
    case 'number': {
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number';
    }
    case 'boolean': {
      return typeof value === 'boolean' ? null : 'must be true or false';
    }
    default: {
      return 'has an unknown type';
    }
  }
};

/** The empty value of a type: `''`, `0`, `false`. */
export const defaultConstantValue = (type: TConstantType): TConstantValue => {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  return '';
};

/** Converts a value to `type` when the user switches a constant's type; falls back to the type's empty value. */
export const coerceConstantValue = (type: TConstantType, value: unknown): TConstantValue => {
  if (validateConstantValue(type, value) === null) return value as TConstantValue;
  if (type === 'string') {
    return typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
  }
  if (type === 'number') {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
    return typeof value === 'boolean' ? Number(value) : 0;
  }
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return typeof value === 'number' ? value !== 0 : false;
};

export type TNormalizeConstantsResult =
  | { readonly ok: true; readonly data: IConstantsDocumentData }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validates a `constants` document's data (`null`/absent = empty): every constant has an id, a valid unique name, a
 * known type and dev/prod values of that type. Returns a copy with only the known keys, or every problem found.
 */
export const normalizeConstantsDocumentData = (raw: unknown): TNormalizeConstantsResult => {
  if ((raw ?? null) === null) return { ok: true, data: emptyConstantsData() };
  if (!isRecord(raw) || !Array.isArray(raw.constants)) {
    return { ok: false, errors: ['Constants data must be an object with a "constants" list'] };
  }
  if (raw.constants.length > CONSTANTS_MAX_COUNT) {
    return { ok: false, errors: [`A project may have at most ${CONSTANTS_MAX_COUNT} constants`] };
  }
  const errors: string[] = [];
  const constants: IWorkflowConstant[] = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  raw.constants.forEach((item: unknown, index) => {
    const where = `constants[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const { id, name, type, dev, prod } = item;
    if (typeof id !== 'string' || id === '') errors.push(`${where}: needs an "id"`);
    else if (seenIds.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    else seenIds.add(id);
    const label = typeof name === 'string' && name !== '' ? `${where} (${name})` : where;
    if (typeof name === 'string') {
      const nameError = validateConstantName(name);
      if (nameError) errors.push(`${label}: ${nameError}`);
      else if (seenNames.has(name)) errors.push(`${label}: the name "${name}" is used twice`);
      seenNames.add(name);
    } else {
      errors.push(`${where}: needs a "name"`);
    }
    if (!isConstantType(type)) {
      errors.push(`${label}: "type" must be one of ${CONSTANT_TYPES.join(', ')}`);
      return;
    }
    const devError = validateConstantValue(type, dev);
    if (devError) errors.push(`${label}: the dev value ${devError}`);
    const prodError = validateConstantValue(type, prod);
    if (prodError) errors.push(`${label}: the prod value ${prodError}`);
    if (typeof id === 'string' && typeof name === 'string') {
      constants.push({ id, name, type, dev: dev as TConstantValue, prod: prod as TConstantValue });
    }
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { constants } };
};

/** The valid constants of possibly malformed data (an invalid document reads as empty) — for read-only consumers. */
export const readConstants = (raw: unknown): readonly IWorkflowConstant[] => {
  const result = normalizeConstantsDocumentData(raw);
  return result.ok ? result.data.constants : [];
};

/** Ambient declarations of the constants for the code fields' type checker (`declare const API_URL: string;`). */
export const buildConstantsDeclarations = (constants: readonly IWorkflowConstant[]): string =>
  constants.map((constant) => `declare const ${constant.name}: ${constant.type};`).join('\n');

/** A TypeScript literal of a validated value (`JSON.stringify` quotes and escapes a string). */
const toLiteral = (value: TConstantValue): string =>
  typeof value === 'string' ? JSON.stringify(value) : String(value);

/** The compiled form of the constants for `env`: one module-level `const NAME: type = <value>;` per constant. */
export const buildConstantsModuleCode = (constants: readonly IWorkflowConstant[], env: TConstantEnv): string =>
  constants.map((constant) => `const ${constant.name}: ${constant.type} = ${toLiteral(constant[env])};`).join('\n');

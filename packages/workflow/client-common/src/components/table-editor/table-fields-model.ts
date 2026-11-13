import {
  normalizeTableDocumentData,
  TABLE_FIELD_TYPES,
  type ITableDocumentData,
  type ITableField,
  type TTableFieldType,
} from '@falang/workflow-dto';

/** Pure editing helpers behind the Fields dialog (ADR 0075 (private)). Every function returns a new object. */

const uniqueName = (fields: readonly ITableField[], base: string): string => {
  const taken = new Set(fields.map((field) => field.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}${n}`.toLowerCase())) return `${base}${n}`;
  }
};

/** Appends a field with the next stable id (`f<nextFieldNo>`); the id is never reused. */
export const addField = (data: ITableDocumentData, type: TTableFieldType = 'text'): ITableDocumentData => {
  const id = `f${data.nextFieldNo}`;
  const field: ITableField = {
    id,
    name: uniqueName(data.fields, `field${data.nextFieldNo}`),
    type,
    ...(type === 'select' ? { options: ['option1'] } : {}),
  };
  return { fields: [...data.fields, field], nextFieldNo: data.nextFieldNo + 1 };
};

/** Applies a patch to one field; switching to `select` seeds options, leaving it drops them. */
export const updateField = (
  data: ITableDocumentData,
  id: string,
  patch: Partial<Omit<ITableField, 'id'>>,
): ITableDocumentData => ({
  ...data,
  fields: data.fields.map((field) => {
    if (field.id !== id) return field;
    const next: ITableField = { ...field, ...patch };
    if (next.type === 'select') next.options = next.options && next.options.length > 0 ? next.options : ['option1'];
    else delete next.options;
    if (next.required !== true) delete next.required;
    if (next.description === '') delete next.description;
    const retyped = (patch.type ?? field.type) !== field.type;
    const clearedDefault = (next.defaultValue ?? null) === null || next.defaultValue === '';
    if (!next.required || (retyped && !Object.hasOwn(patch, 'defaultValue')) || clearedDefault) {
      delete next.defaultValue;
    }
    return next;
  }),
});

export const removeField = (data: ITableDocumentData, id: string): ITableDocumentData => ({
  ...data,
  fields: data.fields.filter((field) => field.id !== id),
});

export const moveField = (data: ITableDocumentData, id: string, direction: -1 | 1): ITableDocumentData => {
  const index = data.fields.findIndex((field) => field.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= data.fields.length) return data;
  const fields = [...data.fields];
  const [moved] = fields.splice(index, 1);
  fields.splice(target, 0, moved as ITableField);
  return { ...data, fields };
};

/** Retyping hides stored values that do not parse as the new type (they stay stored until overwritten). */
export const retypeHidesValues = (from: TTableFieldType, to: TTableFieldType): boolean => from !== to;

/** Fields whose type differs between the saved definition and a draft (by id) — the retype warning list. */
export const retypedFields = (saved: ITableDocumentData, draft: ITableDocumentData): ITableField[] =>
  draft.fields.filter((field) => {
    const before = saved.fields.find((item) => item.id === field.id);
    return before ? retypeHidesValues(before.type, field.type) : false;
  });

/** Fields of the saved definition that the draft no longer has — deleting one breaks published code that writes it. */
export const removedFields = (saved: ITableDocumentData, draft: ITableDocumentData): ITableField[] =>
  saved.fields.filter((field) => !draft.fields.some((item) => item.id === field.id));

/** Options text of a `select` field: one per line. */
export const optionsToText = (options: readonly string[] | undefined): string => (options ?? []).join('\n');

export const textToOptions = (text: string): string[] => [
  ...new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  ),
];

export type TDraftValidation = { ok: true; data: ITableDocumentData } | { ok: false; error: string };

/** Validates a draft with the shared normaliser (`prev` keeps `nextFieldNo` monotone). */
export const validateTableDraft = (prev: ITableDocumentData, draft: ITableDocumentData): TDraftValidation => {
  const result = normalizeTableDocumentData(prev, draft);
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
};

export const FIELD_TYPE_OPTIONS: readonly TTableFieldType[] = TABLE_FIELD_TYPES;

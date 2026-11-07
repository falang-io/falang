import { normalizeTableDocumentData, type ITableDocumentData } from './table-document.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Turns the field list an agent wrote into a validated definition (ADR 0075 (private)): a field with an `id` that the
 * table already has keeps it (renaming and retyping stay the same column, its data survives); a field WITHOUT an `id`
 * is new and gets the next free id; an `id` the table does not have is rejected (ids are never invented by callers);
 * a field missing from the list is deleted. Pure; never touches a store.
 */
export const buildTableFields = (
  previous: ITableDocumentData | null,
  rawFields: unknown,
): { ok: true; data: ITableDocumentData } | { ok: false; error: string } => {
  if (!Array.isArray(rawFields)) return { ok: false, error: '"fields" must be an array of { name, type, … }' };
  const known = new Set((previous?.fields ?? []).map((field) => field.id));
  let nextNo = previous?.nextFieldNo ?? 1;
  const fields: unknown[] = [];
  for (const [index, item] of rawFields.entries()) {
    if (!isRecord(item)) return { ok: false, error: `fields[${index}] must be an object` };
    const id = item.id;
    if ((id ?? null) === null || id === '') {
      fields.push({ ...item, id: `f${nextNo}` });
      nextNo += 1;
    } else if (typeof id === 'string' && known.has(id)) {
      fields.push(item);
    } else {
      return {
        ok: false,
        error: `fields[${index}].id "${String(id)}" is not a field of this table — omit "id" for a new field`,
      };
    }
  }
  return normalizeTableDocumentData(previous, { fields, nextFieldNo: nextNo });
};

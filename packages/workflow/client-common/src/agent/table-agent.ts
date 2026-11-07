import {
  buildTableFields,
  emptyTableData,
  TABLE_DOCUMENT_TYPE,
  TABLE_FIELD_TYPES,
  type ITableDocumentData,
  type ITableField,
} from '@falang/workflow-dto';

/** Directory of table files in the agent's JSON-files interface. */
export const TABLE_FILES_DIR = 'tables';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The table file text: the fields (with ids) and the counter, pretty-printed. */
export const renderTableFile = (data: ITableDocumentData): string => `${JSON.stringify(data, null, 2)}\n`;

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

/** Parses a written table file (`{ "fields": [...] }`; `nextFieldNo` in the text is ignored) into a definition. */
export const parseTableFile = (
  previous: ITableDocumentData | null,
  text: string,
): { ok: true; data: ITableDocumentData } | { ok: false; error: string } => {
  const parsed = safeParseJson(text);
  if (parsed instanceof Error) return { ok: false, error: `not valid JSON: ${parsed.message}` };
  if (!isRecord(parsed)) return { ok: false, error: 'a table file is a JSON object { "fields": [...] }' };
  return buildTableFields(previous, parsed.fields ?? []);
};

/** `name:type`, `!` after the type for a required field — the project-context line of a table. */
export const describeTableFields = (data: ITableDocumentData): string => {
  const fields = data.fields.map((field: ITableField) => `${field.name}:${field.type}${field.required ? '!' : ''}`);
  return fields.length > 0 ? `fields: ${fields.join(', ')}` : 'no fields yet';
};

export { buildTableFields, emptyTableData, TABLE_DOCUMENT_TYPE, TABLE_FIELD_TYPES };

/** Section of `NODES.md` for tables — the agent's whole picture of the table files. */
export const TABLE_NOTES = [
  '# Tables',
  'A table is a built-in record store. Its file `tables/<name>.json` holds only the field definitions (records are ' +
    'edited by people in the grid and by the `table-*` workflow nodes — never by you):',
  '```json\n{ "fields": [ { "id": "f1", "name": "title", "type": "text", "required": true }, { "name": "status", "type": "select", "options": ["new", "done"] } ] }\n```',
  `Field types: ${TABLE_FIELD_TYPES.join(', ')}. \`select\` needs a non-empty \`options\` list. Field names are ` +
    'identifier-like (letters, digits, `_`; Unicode letters allowed), unique ignoring case, and not `id`, `version`, ' +
    '`createdAt`, `updatedAt`, `and`, `or`.',
  'Field ids: keep the `"id"` of every field you keep (renaming or retyping a field with its id keeps the column and its ' +
    'data); give a NEW field no `id` — it gets the next free one; a field you leave out is deleted with its data. ' +
    '`nextFieldNo` is computed — ignore it.',
  'The file name is the table name. A `table-*` workflow node (`table-select`, `table-insert`, …) names its table in ' +
    'its `table` field by the table FILE PATH, e.g. "tables/orders.json" (stored as the document id), and its record ' +
    'values and `where` use the field NAMES. Create a table by writing a new `tables/<name>.json`.',
].join('\n\n');

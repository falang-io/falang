/**
 * `NODE_KIND_NOTES` entries of the `tables` vendor (project tables, ADR 0075 (private)) — plain-English, LLM-only,
 * merged into `NODE_KIND_NOTES` by `node-kinds.ts` like the other vendor files.
 */

const TABLE_FIELD = [
  '`table` is the id of a `table` document of this project (see `list_documents`), not its name;',
  "`where`/`row`/`set` are TypeScript expressions using the table's FIELD NAMES as keys.",
].join(' ');

const WHERE = [
  'A filter is an object: `{ status: "new" }` is equality, `{ age: { gt: 18 } }` an operator (`eq ne gt gte lt lte in notIn',
  'isNull like ilike startsWith contains`); several keys are AND-ed, `{ or: [{ … }, { … }] }` / `{ and: […] }` nest;',
  'the system keys `id`, `version`, `createdAt`, `updatedAt` can be filtered too.',
].join(' ');

export const TABLES_VENDOR_NODE_KIND_NOTES: Record<string, string> = {
  'table-select': [
    "Reads records of a project table into an array variable (each element has the table's fields plus `id`, `version`,",
    '`createdAt`, `updatedAt`). The result is a SNAPSHOT: read once, then work on the array — later changes by other runs',
    'do not show up in it. `where` is optional (empty = all records).',
    TABLE_FIELD,
    WHERE,
    '`orderBy` is text such as `name asc, createdAt desc`; `limit` defaults to 100 (max 1000), `offset` to 0.',
  ].join(' '),
  'table-get': [
    'Reads ONE record of a project table by its `id` (a string expression) into a variable. A missing record fails the',
    'node (no retry) — use `table-select` with a filter when the record may not exist.',
    TABLE_FIELD,
  ].join(' '),
  'table-insert': [
    'Adds a record to a project table and returns it (with its new `id`, `version` 1 and timestamps). `row` holds the',
    "table's fields by name; required fields must be present unless their field definition has a defaultValue, which",
    'is applied when omitted. Temporal retries of the same node never create a duplicate. The returned record is a snapshot.',
    TABLE_FIELD,
  ].join(' '),
  'table-update': [
    'Changes every record matching `where` with the fields in `set` and returns how many records were changed (a',
    'number). `where` is REQUIRED and must be non-empty — the node never touches "everything" by accident. Setting a',
    'field to `null` clears it. Optimistic locking: filter by `{ id, version }` taken from a record you read earlier —',
    'if somebody changed it meanwhile, nothing matches and the result is 0.',
    TABLE_FIELD,
    WHERE,
  ].join(' '),
  'table-delete': [
    'Deletes every record matching `where` and returns how many were deleted (a number). `where` is REQUIRED and must',
    'be non-empty. Filter by `{ id, version }` to delete only if nobody changed the record since you read it.',
    TABLE_FIELD,
    WHERE,
  ].join(' '),
};

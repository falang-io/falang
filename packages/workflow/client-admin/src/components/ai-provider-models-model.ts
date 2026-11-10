import type { IAdminAiProviderModel, TAdminAiProviderModelKind } from '../admin-api.js';

/** One editable row of the built-in AI provider's models table (`key` is a stable React key, never sent). */
export interface IAiProviderModelRow {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly kind: TAdminAiProviderModelKind;
}

let nextRowKey = 0;
const rowKey = (): string => {
  nextRowKey += 1;
  return `row-${nextRowKey}`;
};

export const toModelRows = (models: readonly IAdminAiProviderModel[]): IAiProviderModelRow[] =>
  models.map((model) => ({ key: rowKey(), id: model.id, label: model.label ?? '', kind: model.kind }));

export const emptyModelRow = (kind: TAdminAiProviderModelKind = 'chat'): IAiProviderModelRow => ({
  key: rowKey(),
  id: '',
  label: '',
  kind,
});

/**
 * The `models` of the `PUT` body: ids and labels trimmed, an empty label left out, rows without an id dropped (an empty
 * row the admin added and never filled). Duplicates are left to the backend, which names them.
 */
export const rowsToModels = (rows: readonly IAiProviderModelRow[]): IAdminAiProviderModel[] =>
  rows
    .map((row) => ({ id: row.id.trim(), label: row.label.trim(), kind: row.kind }))
    .filter((row) => row.id !== '')
    .map((row) => (row.label === '' ? { id: row.id, kind: row.kind } : row));

/** Appends the picked upstream ids as rows of `kind`, skipping ids already listed for that kind. */
export const addUpstreamModels = (
  rows: readonly IAiProviderModelRow[],
  ids: readonly string[],
  kind: TAdminAiProviderModelKind,
): IAiProviderModelRow[] => {
  const present = new Set(rows.filter((row) => row.kind === kind).map((row) => row.id.trim()));
  const added = ids
    .filter((id, index) => !present.has(id) && ids.indexOf(id) === index)
    .map((id) => ({ key: rowKey(), id, label: '', kind }));
  return [...rows, ...added];
};

/**
 * Best guess of a model's kind from its id, for the "Load from provider" picker's default: image generators and speech
 * recognizers have recognisable names; everything else is a chat model. The admin can change it before adding.
 */
export const guessModelKind = (id: string): TAdminAiProviderModelKind => {
  const lower = id.toLowerCase();
  if (/dall-?e|image|imagen|flux|stable-?diffusion|sdxl/.test(lower)) return 'image';
  if (/whisper|transcri|speech-to-text|stt/.test(lower)) return 'transcribe';
  return 'chat';
};

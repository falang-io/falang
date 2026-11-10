/** Which OpenAI-compatible endpoint a built-in provider model serves (ADR 0081 (private)). */
export type TAiProviderModelKind = 'chat' | 'image' | 'transcribe';
export const AI_PROVIDER_MODEL_KINDS: readonly TAiProviderModelKind[] = ['chat', 'image', 'transcribe'];

/** One entry of the admin's model list (`aiProvider.models`). `label` is optional; a reader falls back to `id`. */
export interface IAiProviderModel {
  readonly id: string;
  readonly label?: string;
  readonly kind: TAiProviderModelKind;
}

export const MAX_AI_PROVIDER_MODELS = 200;
const MAX_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 200;

export type TAiProviderModelsParseResult =
  | { readonly ok: true; readonly models: IAiProviderModel[] }
  | { readonly ok: false; readonly errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{ label }` for a non-empty label, `{}` for none/empty; a problem goes to `errors`. */
const parseLabel = (entry: Record<string, unknown>, at: string, errors: string[]): { label?: string } => {
  if (!Object.hasOwn(entry, 'label') || entry.label === null) return {};
  const raw = entry.label;
  if (typeof raw !== 'string') {
    errors.push(`${at}.label: must be a string`);
    return {};
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_LABEL_LENGTH) {
    errors.push(`${at}.label: at most ${MAX_LABEL_LENGTH} characters`);
    return {};
  }
  return trimmed === '' ? {} : { label: trimmed };
};

const parseEntry = (raw: unknown, index: number, errors: string[]): IAiProviderModel | null => {
  const at = `models[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${at}: must be an object { id, label?, kind }`);
    return null;
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id === '') errors.push(`${at}.id: must be a non-empty string`);
  else if (id.length > MAX_ID_LENGTH) errors.push(`${at}.id: at most ${MAX_ID_LENGTH} characters`);
  const kind = raw.kind;
  const kindValid = typeof kind === 'string' && (AI_PROVIDER_MODEL_KINDS as readonly string[]).includes(kind);
  if (!kindValid) errors.push(`${at}.kind: must be one of ${AI_PROVIDER_MODEL_KINDS.join(', ')}`);
  const label = parseLabel(raw, at, errors);
  if (id === '' || id.length > MAX_ID_LENGTH || !kindValid) return null;
  return { id, kind: kind as TAiProviderModelKind, ...label };
};

/**
 * Validates and normalises the admin's model list: an array of `{ id, label?, kind }`, ids trimmed and non-empty,
 * unique within one kind (the same id may serve two kinds), an empty label dropped. Every problem is listed.
 */
export const parseAiProviderModels = (raw: unknown): TAiProviderModelsParseResult => {
  if (!Array.isArray(raw)) return { ok: false, errors: ['models: must be an array'] };
  if (raw.length > MAX_AI_PROVIDER_MODELS) {
    return { ok: false, errors: [`models: at most ${MAX_AI_PROVIDER_MODELS} entries`] };
  }
  const errors: string[] = [];
  const models: IAiProviderModel[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const model = parseEntry(entry, index, errors);
    if (!model) return;
    const key = `${model.kind}\u0000${model.id}`;
    if (seen.has(key)) {
      errors.push(`models[${index}].id: "${model.id}" is listed twice for kind "${model.kind}"`);
      return;
    }
    seen.add(key);
    models.push(model);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, models };
};

/** Reads the stored JSON leniently: anything unreadable counts as an empty list (it was validated on write). */
export const readStoredAiProviderModels = (stored: string | null): IAiProviderModel[] => {
  if (stored === null) return [];
  try {
    const parsed = parseAiProviderModels(JSON.parse(stored));
    return parsed.ok ? parsed.models : [];
  } catch {
    return [];
  }
};

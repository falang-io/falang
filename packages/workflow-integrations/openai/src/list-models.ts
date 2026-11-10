import type {
  IBackendEgress,
  IFieldOptionsContext,
  IFieldSelectOption,
  IPlatformModel,
  TPlatformModelKind,
} from '@falang/workflow-integrations-common';

/**
 * Fetches `<baseUrl>/models` and maps it to select options — shared by every OpenAI-compatible
 * `model` field (`call-ai-text`/`call-ai-choice`/`call-ai-image`'s `loadOptions`). `keywords`, when
 * given, narrows the result to ids containing any of them (case-insensitive) — e.g. `call-ai-image`
 * only wants image-generation models — falling back to the full, unfiltered list whenever the filter
 * would otherwise leave nothing to pick from (a self-hosted/compatible server may not name its models
 * the way OpenAI's own catalog does).
 */
export const fetchOpenAiModelOptions = async (
  fields: Readonly<Record<string, string>>,
  /** Backend SSRF guard (`ctx.egress` of `loadOptions`): `baseUrl` is tenant data and this runs inside the backend, so every real call goes through it. */
  egress?: IBackendEgress,
  keywords?: readonly string[],
): Promise<readonly IFieldSelectOption[]> => {
  const doFetch = egress ? egress.fetch : fetch;
  const response = await doFetch(`${fields.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${fields.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to list OpenAI models: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { data: { id: string }[] };
  const all = data.data.map((model) => ({ value: model.id, label: model.id }));
  if (!keywords || keywords.length === 0) return all;
  const filtered = all.filter((option) => keywords.some((keyword) => option.value.toLowerCase().includes(keyword)));
  return filtered.length > 0 ? filtered : all;
};

/** The built-in provider's models of one kind as select options (ADR 0081 (private)) — no upstream call. */
export const platformModelOptions = (
  models: readonly IPlatformModel[],
  kind: TPlatformModelKind,
): readonly IFieldSelectOption[] =>
  models.filter((model) => model.kind === kind).map((model) => ({ value: model.id, label: model.label }));

/**
 * The `loadOptions` of an OpenAI `model` field: for an instance on the built-in provider (`ctx.platformModels` set by
 * the backend) the admin's models of `kind`, never an upstream call; otherwise the instance's own `<baseUrl>/models`.
 */
export const loadOpenAiModelOptions =
  (kind: TPlatformModelKind, keywords?: readonly string[]) =>
  (fields: Readonly<Record<string, string>>, ctx?: IFieldOptionsContext): Promise<readonly IFieldSelectOption[]> =>
    ctx?.platformModels
      ? Promise.resolve(platformModelOptions(ctx.platformModels, kind))
      : fetchOpenAiModelOptions(fields, ctx?.egress, keywords);

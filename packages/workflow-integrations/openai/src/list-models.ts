import type { IFieldSelectOption } from '@falang/workflow-integrations-common';

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
  keywords?: readonly string[],
): Promise<readonly IFieldSelectOption[]> => {
  const response = await fetch(`${fields.baseUrl}/models`, {
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

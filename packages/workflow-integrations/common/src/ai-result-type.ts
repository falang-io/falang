/**
 * The internal result shape of every AI text activity (ADR 0059 (private) §2b): the text the scheme
 * author sees plus token usage and the model actually used, which the runner's journal wrapper reads.
 * Spliced verbatim into `activitySignature` text (that string lands in `workflows.ts`, which never
 * imports a vendor package — same reasoning as `files`' inlined `FILE_REF_TYPE`), so it is a plain
 * object type with no named references. The vendor's `emit` unwraps `.text` — the scheme variable
 * stays a `string`.
 */
export const AI_USAGE_TYPE = '{ promptTokens: number; completionTokens: number; totalTokens: number }';

export const AI_TEXT_RESULT_TYPE = `{ text: string; usage?: ${AI_USAGE_TYPE}; model: string }`;

/**
 * Activity-side source (a TS snippet for `activityCode`) turning an OpenAI-compatible
 * `chat/completions` JSON body's `usage` (`prompt_tokens`/…) into the `AI_USAGE_TYPE` shape, or
 * `undefined` when the vendor sent none.
 */
export const OPENAI_COMPATIBLE_USAGE_EXPRESSION = (dataVar: string): string =>
  `${dataVar}.usage ? { promptTokens: ${dataVar}.usage.prompt_tokens ?? 0, completionTokens: ${dataVar}.usage.completion_tokens ?? 0, totalTokens: ${dataVar}.usage.total_tokens ?? 0 } : undefined`;

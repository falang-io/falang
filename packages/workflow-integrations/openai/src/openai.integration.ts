// oxlint-disable max-lines -- over the cap only by the run-journal result shape (ADR 0059 (private)).
import {
  AI_TEXT_RESULT_TYPE,
  AI_USAGE_TYPE,
  OPENAI_COMPATIBLE_USAGE_EXPRESSION,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { fileArrayTypeInfo } from '@falang/workflow-integrations-files';
import { CALL_AI_CHOICE_NAME, CALL_AI_TEXT_NAME, FILE_REF_TYPE, OPENAI_VENDOR } from './constants.js';
import { fetchOpenAiModelOptions } from './list-models.js';
import { openaiMediaActions } from './openai-media-actions.js';

export * from './constants.js';
export * from './list-models.js';
export * from './openai-media-actions.js';

type TResultInfo = { type: 'string' } | { type: 'struct'; id: string };

const parseResultInfo = (raw: string): TResultInfo => {
  if (!raw) return { type: 'string' };
  try {
    return JSON.parse(raw) as TResultInfo;
  } catch {
    return { type: 'string' };
  }
};

/**
 * OpenAI-compatible chat completion provider — `baseUrl` lets this cover any vendor exposing the
 * same `/chat/completions`/`/models` shape (Azure OpenAI, local llama.cpp servers, …), not just
 * api.openai.com. `apiKey`'s prod value is optional (`secretProdOptional`) since a single key is
 * often shared across dev/prod for this kind of credential — see `resolveFieldValue`'s dev fallback
 * in `@falang/workflow-backend`.
 */
export const openaiIntegration: IWorkflowIntegration = {
  vendor: OPENAI_VENDOR,
  label: 'openai:label',
  notes:
    'OpenAI and any OpenAI-compatible LLM API (ChatGPT, GPT models, or a self-hosted/compatible endpoint via base ' +
    'URL) — AI / LLM / neural network text generation from a prompt with optional file attachments (images, PDFs), ' +
    'AI structured choice among declared options with typed data, AI image generation (text-to-image, ' +
    'DALL-E-style), and audio transcription (speech-to-text, Whisper-style).',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [
    { name: 'baseUrl', label: 'openai:credentialField.baseUrl', kind: 'text' },
    { name: 'apiKey', label: 'openai:credentialField.apiKey', kind: 'secret', secretProdOptional: true },
  ],
  triggers: [],
  actions: [
    {
      name: CALL_AI_TEXT_NAME,
      label: 'openai:action.callAiText',
      // Multi-field, richer-than-string-inputs editor (model list, prompt, result type) — see
      // ADR 0006's follow-up on `EditorType.configurable`.
      editorType: 'sidebar',
      fields: [
        { name: 'integration', label: 'openai:field.integration', kind: 'credential-ref', vendor: OPENAI_VENDOR },
        {
          name: 'model',
          label: 'openai:field.model',
          kind: 'select',
          vendor: OPENAI_VENDOR,
          loadOptions: (fields, ctx) => fetchOpenAiModelOptions(fields, ctx?.egress),
        },
        { name: 'prompt', label: 'openai:field.prompt', kind: 'template-string' },
        {
          name: 'attachments',
          label: 'openai:field.attachments',
          kind: 'expression',
          expectedType: fileArrayTypeInfo(),
          defaultValue: '[]',
        },
        { name: 'result', label: 'openai:field.result', kind: 'result-type' },
        { name: 'resultVariable', label: 'openai:field.resultVariable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const resultInfo = parseResultInfo(fields.result);
        if (resultInfo.type === 'struct') {
          // Structured output requires the compiler to resolve a struct id into a JSON Schema —
          // that capability doesn't exist anywhere in the compiler yet (same gap as `create-var`
          // rendering struct/enum types as `any`). Fail loudly at compile time rather than emit a
          // call that silently ignores the chosen result type.
          throw new Error(
            'call-ai-text: structured output isn\'t supported by the compiler yet — pick "Text" for "Result" for now.',
          );
        }
        // An empty `attachments` field (never edited, or deliberately left blank) compiles to a
        // literal `[]` rather than an empty string, so the emitted call always type-checks — see
        // `resolveFieldExpression`'s `'expression'` handling (a blank field resolves to `''`).
        // The activity returns `{ text, usage, model }` (run journal, ADR 0059 (private)); the scheme variable stays a `string`.
        const call = `await callAiText(${fields.integration}, ${fields.model}, ${fields.prompt}, ${fields.attachments || '[]'})`;
        // `resultVariable` is a bare identifier (see `resolveFieldExpression`'s `'new-variable'`
        // pass-through) — empty only for a node created but never edited yet, in which case the
        // call is still emitted, just without capturing its result anywhere.
        return fields.resultVariable ? `const ${fields.resultVariable} = (${call}).text;` : `${call};`;
      },
      activitySignature: `callAiText(credentialId: string, model: string, prompt: string, attachments: readonly ${FILE_REF_TYPE}[]): Promise<${AI_TEXT_RESULT_TYPE}>`,
      // Run journal (ADR 0059 (private)): the request as sent (model, prompt, attachment descriptors — never bodies) and the answer + usage.
      journal: { kind: 'ai', args: ['model', 'prompt', 'attachments'] },
      // Same `result`-field parse `emit` above already does — a plain `string` result unless a
      // struct was chosen (in which case `emit` itself throws at compile time; the scope type is
      // still reported here so Monaco shows *something* sane while the node is mid-edit). Marked
      // `constant: true` so `buildHiddenScopeCode` declares it `const`, not `var` — matches the old,
      // hardcoded `'call-ai-text'` entry this generalizes (see ADR 0009 (private)'s
      // `SCOPE_CONTRIBUTORS`/`registerScopeContributor` history).
      resultType: (fields) => {
        const resultInfo = parseResultInfo(fields.result);
        return resultInfo.type === 'struct'
          ? { type: 'struct', id: resultInfo.id, constant: true }
          : { type: 'string', constant: true };
      },
      activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes' },
      // Verbatim TS emitted into activities.ts, alongside every other registered integration's.
      activityCode: [
        'export const callAiText = async (',
        '  credentialId: string,',
        '  model: string,',
        '  prompt: string,',
        '  attachments: readonly IFileRef[],',
        `): Promise<${AI_TEXT_RESULT_TYPE}> => {`,
        "  const baseUrl = await resolveOpenAiField(credentialId, 'baseUrl');",
        "  const apiKey = await resolveOpenAiField(credentialId, 'apiKey');",
        '  const messageContent =',
        '    attachments.length > 0',
        "      ? [{ type: 'text', text: prompt }, ...(await buildAiAttachmentParts(attachments))]",
        '      : prompt;',
        '  const response = await fetch(`${baseUrl}/chat/completions`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },",
        "    body: JSON.stringify({ model, messages: [{ role: 'user', content: messageContent }] }),",
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`OpenAI chat completion failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as {',
        '    choices: { message: { content: string } }[];',
        '    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };',
        '    model?: string;',
        '  };',
        `  return { text: data.choices[0]?.message.content ?? '', usage: ${OPENAI_COMPATIBLE_USAGE_EXPRESSION('data')}, model: data.model ?? model };`,
        '};',
      ].join('\n'),
    },
    ...openaiMediaActions,
  ],
  choices: [
    {
      name: CALL_AI_CHOICE_NAME,
      label: 'openai:choice.callAiChoice',
      contextFields: [
        { name: 'integration', label: 'openai:field.integration', kind: 'credential-ref', vendor: OPENAI_VENDOR },
        {
          name: 'model',
          label: 'openai:field.model',
          kind: 'select',
          vendor: OPENAI_VENDOR,
          loadOptions: (fields, ctx) => fetchOpenAiModelOptions(fields, ctx?.egress),
        },
      ],
      promptFields: [
        { name: 'prompt', label: 'openai:field.prompt', kind: 'template-string' },
        {
          name: 'attachments',
          label: 'openai:field.attachments',
          kind: 'expression',
          expectedType: fileArrayTypeInfo(),
          defaultValue: '[]',
        },
      ],
      // `attachments: … | undefined` (not a plain `readonly ${FILE_REF_TYPE}[]`, unlike `callAiText`'s
      // own signature) because `attachments` reaches this activity through `@falang/workflow-compiler`'s
      // generic choice-arg-joining (`choice-emitters.ts`), which has no per-field hook to substitute a
      // `'[]'` default the way `callAiText`'s own action `emit` does — a node with no `attachments` data
      // (an older document predating this field, or a fixture that never set it) compiles the call
      // site's argument to the literal `undefined`, which this signature must accept.
      activitySignature: `callAiChoice(credentialId: string, model: string, prompt: string, attachments: readonly ${FILE_REF_TYPE}[] | undefined, schema: unknown): Promise<{ action: string; data: unknown; usage?: ${AI_USAGE_TYPE}; model: string }>`,
      journal: { kind: 'ai', args: ['model', 'prompt', 'attachments'] },
      // `schema` is the discriminated-union JSON Schema `@falang/workflow-compiler`'s `choice-emitters.ts`
      // builds from this node's options — passed in as an inline object literal by the compiled call
      // site, not JSON-encoded. OpenAI's Structured Outputs (strict mode) requires the *root* schema to
      // be a plain object, not `anyOf` — so the `anyOf` lives one level down, under a `result` property,
      // and this activity unwraps it again before returning. (Flagged for verification against current
      // OpenAI docs — not confirmed via a live call in this session.)
      activityCode: [
        'export const callAiChoice = async (',
        '  credentialId: string,',
        '  model: string,',
        '  prompt: string,',
        '  attachments: readonly IFileRef[] | undefined,',
        '  schema: unknown,',
        `): Promise<{ action: string; data: unknown; usage?: ${AI_USAGE_TYPE}; model: string }> => {`,
        "  const baseUrl = await resolveOpenAiField(credentialId, 'baseUrl');",
        "  const apiKey = await resolveOpenAiField(credentialId, 'apiKey');",
        '  const resolvedAttachments = attachments ?? [];',
        '  const messageContent =',
        '    resolvedAttachments.length > 0',
        "      ? [{ type: 'text', text: prompt }, ...(await buildAiAttachmentParts(resolvedAttachments))]",
        '      : prompt;',
        '  const wrappedSchema = {',
        "    type: 'object',",
        '    properties: { result: schema },',
        "    required: ['result'],",
        '    additionalProperties: false,',
        '  };',
        '  const response = await fetch(`${baseUrl}/chat/completions`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },",
        '    body: JSON.stringify({',
        '      model,',
        "      messages: [{ role: 'user', content: messageContent }],",
        '      response_format: {',
        "        type: 'json_schema',",
        "        json_schema: { name: 'choice', schema: wrappedSchema, strict: true },",
        '      },',
        '    }),',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`OpenAI structured chat completion failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as {',
        '    choices: { message: { content: string } }[];',
        '    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };',
        '    model?: string;',
        '  };',
        "  const content = data.choices[0]?.message.content ?? '{}';",
        '  const parsed = JSON.parse(content) as { result: { action: string; data: unknown } };',
        `  return { ...parsed.result, usage: ${OPENAI_COMPATIBLE_USAGE_EXPRESSION('data')}, model: data.model ?? model };`,
        '};',
      ].join('\n'),
      activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes' },
    },
  ],
  // Shared by `callAiText`/`callAiChoice`/`callAiImage`/`callAiTranscribe` — emitted once by
  // `compileActivities` (see `IWorkflowIntegration.sharedActivityCode`) so this isn't redeclared per
  // activity, which would collide once concatenated into one activities.ts module. `IFileRef` and the
  // `files` helpers are real imports (this module lands in activities.ts, a real Node file, unlike
  // `activitySignature`'s inlined `FILE_REF_TYPE` — see that constant's own doc comment).
  sharedActivityCode: [
    // Aliased so this never collides with `@falang/workflow-integrations-files`'s own
    // `import { ..., readFileBytes, uploadFileFromStream, ... } from '@falang/workflow-integrations-files';`
    // in its own `sharedActivityCode` — `files` is always registered alongside every other vendor (see
    // `packages/workflow/backend/src/domains/integrations/registered-integrations.ts`), and
    // `compileActivities` only dedups whole import *statements* that are string-identical, not
    // individual imported bindings, so two differently-shaped imports of the same name would
    // otherwise redeclare it twice in the same generated module — same fix, same reasoning, as
    // `telegram.integration.ts`'s own aliased `readFileBytes as telegramReadFileBytes`. `fileToDataUrl`
    // is unique to this vendor so it needs no alias. The `IFileRef` type import below is deliberately
    // the exact same line files' own `sharedActivityCode` uses, so it dedups instead of colliding.
    "import { fileToDataUrl, readFileBytes as openaiReadFileBytes, uploadFileFromStream as openaiUploadFileFromStream } from '@falang/workflow-integrations-files';",
    "import type { IFileRef } from '@falang/workflow-integrations-files';",
    '',
    "// Resolves credentialId+field -> real value via @falang/workflow-backend's internal endpoint —",
    "// same trust boundary/mechanism as telegram.integration.ts's resolveTelegramBotToken, but",
    '// generalized (see resolveFieldValue in credentials-codec.ts) to also serve a plain field',
    '// like baseUrl, not just secrets.',
    'const resolveOpenAiField = async (credentialId: string, field: string): Promise<string> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    "  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';",
    '  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    "    body: JSON.stringify({ credentialId, vendor: 'openai', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve OpenAI credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
    '',
    '/** Default cap (20 MiB) on one attachment before it is embedded as a base64 data URL in a chat',
    ' *  message — ADR 0038 (private) §6. Configurable via AI_ATTACHMENT_MAX_BYTES so a deployment can',
    ' *  raise/lower it without a code change; read inside the function body (never at module scope) so',
    ' *  this file stays safe to import from the browser bundle too. */',
    'const resolveAiAttachmentMaxBytes = (): number => {',
    '  const raw = process.env.AI_ATTACHMENT_MAX_BYTES;',
    '  const parsed = raw ? Number(raw) : NaN;',
    '  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20 * 1024 * 1024;',
    '};',
    '',
    '/** Turns each attachment into an OpenAI chat-completions content part: `image/*` as an `image_url`',
    ' *  data URL, PDF/text-like mimes (`application/pdf`, `text/*`, `application/json`) as a `file` part',
    ' *  (many OpenAI-compatible servers reject that part; the vendor error surfaces as this activity',
    ' *  failing). Anything else — notably audio — is rejected: transcribe it with call-ai-transcribe',
    ' *  first, then attach the resulting text instead. */',
    'const buildAiAttachmentParts = async (attachments: readonly IFileRef[]): Promise<Record<string, unknown>[]> => {',
    '  const maxBytes = resolveAiAttachmentMaxBytes();',
    '  const parts: Record<string, unknown>[] = [];',
    '  for (const file of attachments) {',
    "    if (file.mime.startsWith('image/')) {",
    "      parts.push({ type: 'image_url', image_url: { url: await fileToDataUrl(file, maxBytes) } });",
    "    } else if (file.mime === 'application/pdf' || file.mime.startsWith('text/') || file.mime === 'application/json') {",
    "      parts.push({ type: 'file', file: { filename: file.name, file_data: await fileToDataUrl(file, maxBytes) } });",
    '    } else {',
    '      throw new Error(`call-ai-text/call-ai-choice: unsupported attachment mime "${file.mime}" for "${file.name}" — transcribe audio with call-ai-transcribe instead of attaching it here.`);',
    '    }',
    '  }',
    '  return parts;',
    '};',
  ].join('\n'),
};

import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { YANDEXGPT_CALL_TEXT_NAME, YANDEXGPT_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * YandexGPT (Yandex Cloud Foundation Models) — LLM, P1 in
 * ADR 0017 (private). Auth is a plain API key, not OAuth2 at
 * all (no client_credentials exchange like GigaChat, no authorization-code flow like amoCRM) — a
 * service-account-issued key sent as `Authorization: Api-Key <key>` (note the `Api-Key` scheme, not
 * `Bearer`), plus a `folder_id` that must be embedded in every request's `modelUri`
 * (`gpt://<folder_id>/<model>`, e.g. `gpt://b1g.../yandexgpt/latest`). No token caching/refresh is
 * needed at all, unlike GigaChat's client_credentials dance.
 *
 * Verified before coding (2026-09-16) against Yandex Cloud's own docs
 * (`yandex.cloud/en/docs/iam/concepts/authorization/api-key`,
 * `aistudio.yandex.ru/docs/en/ai-studio/text-generation/api-ref/TextGeneration/completion.html`) and
 * cross-checked against a real protobuf response cassette from `yandex-cloud/yandex-cloud-ml-sdk`'s
 * test suite — confirming the REST completion response is **not** wrapped in a `result` key (unlike
 * some other Yandex Cloud long-running-operation APIs): `{ alternatives, usage, modelVersion }` sit at
 * the top level, `alternatives[0].message.text` is the generated text.
 *
 * `model` is a plain text field (e.g. `yandexgpt/latest`, `yandexgpt-lite/latest`), not a `loadOptions`
 * dropdown — Yandex Cloud has no public "list available models" endpoint the way OpenAI does, so
 * there's nothing to fetch. MVP scope mirrors `gigachatIntegration`'s `call-ai-text`: one action,
 * plain-text output only.
 */
export const yandexgptIntegration: IWorkflowIntegration = {
  vendor: YANDEXGPT_VENDOR,
  label: 'YandexGPT',
  notes: 'YandexGPT (Yandex Cloud Foundation Models) — Russian AI / LLM / neural network: generate text from a prompt.',
  credentialFields: [
    { name: 'apiKey', label: 'API key', kind: 'secret' },
    { name: 'folderId', label: 'Folder ID', kind: 'text' },
  ],
  triggers: [],
  actions: [
    {
      name: YANDEXGPT_CALL_TEXT_NAME,
      label: 'YandexGPT: Chat completion',
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: YANDEXGPT_VENDOR },
        { name: 'model', label: 'Model (e.g. yandexgpt/latest)', kind: 'text' },
        { name: 'prompt', label: 'Prompt', kind: 'template-string' },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await yandexgptCallText(${fields.credentialId}, ${fields.model}, ${fields.prompt})`;
        // `resultVariable` is a bare identifier — empty only for a node created but never edited yet,
        // in which case the call is still emitted, just without capturing its result anywhere. Same
        // convention as `openaiIntegration`'s `call-ai-text` / `gigachatIntegration`'s.
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature: 'yandexgptCallText(credentialId: string, model: string, prompt: string): Promise<string>',
      // `activitySignature` above always resolves to a plain `string` — same fixed shape as
      // `openaiIntegration`'s `call-ai-text` (which has to be a function since it also supports a
      // chosen struct result; this action has no such option, so a static value is enough).
      resultType: { type: 'string', constant: true },
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const yandexgptCallText = async (',
        '  credentialId: string,',
        '  model: string,',
        '  prompt: string,',
        '): Promise<string> => {',
        '  const [apiKey, folderId] = await Promise.all([',
        "    resolveYandexGptField(credentialId, 'apiKey'),",
        "    resolveYandexGptField(credentialId, 'folderId'),",
        '  ]);',
        "  const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {",
        "    method: 'POST',",
        '    headers: {',
        "      'Content-Type': 'application/json',",
        '      Authorization: `Api-Key ${apiKey}`,',
        '    },',
        '    body: JSON.stringify({',
        '      modelUri: `gpt://${folderId}/${model}`,',
        '      completionOptions: {},',
        "      messages: [{ role: 'user', text: prompt }],",
        '    }),',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`YandexGPT completion failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { alternatives: { message: { text: string } }[] };',
        "  return data.alternatives[0]?.message.text ?? '';",
        '};',
      ].join('\n'),
    },
  ],
  // Shared by every YandexGPT activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`) so it isn't redeclared per activity, which would
  // collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// telegram.integration.ts's resolveTelegramBotToken / onec.integration.ts's resolveOnecField —",
    '// apiKey/folderId commonly differ between a dev and a prod Yandex Cloud folder, unlike an',
    '// OAuth2 token that only ever lives in the dev slot.',
    'const resolveYandexGptField = async (credentialId: string, field: string): Promise<string> => {',
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
    "    body: JSON.stringify({ credentialId, vendor: 'yandexgpt', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve YandexGPT credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
  ].join('\n'),
};

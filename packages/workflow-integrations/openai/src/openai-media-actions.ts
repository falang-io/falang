import type { IActionDescriptor, IActivityOptions } from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import {
  CALL_AI_IMAGE_NAME,
  CALL_AI_TRANSCRIBE_NAME,
  FILE_REF_TYPE,
  IMAGE_SIZE_OPTIONS,
  OPENAI_VENDOR,
} from './constants.js';
import { fetchOpenAiModelOptions } from './list-models.js';

/**
 * `call-ai-image`/`call-ai-transcribe` — the two "get a file back from/into the agent" actions
 * ADR 0038 (private) §6 adds alongside `call-ai-text`/`call-ai-choice`'s `attachments` (see
 * `openai.integration.ts`). Split into their own file to keep `openai.integration.ts` under the
 * repo's `max-lines` budget — same reasoning `@falang/workflow-integrations-files`' own
 * `actions.ts`/`<vendor>.integration.ts` split already follows.
 */

/** Both media activities are real I/O against the vendor (image generation, audio upload/transcription) — not a fit for a 10s local activity (ADR 0038 (private) §3). */
const MEDIA_ACTIVITY_OPTIONS: IActivityOptions = { kind: 'regular', startToCloseTimeout: '10 minutes' };

const emitCall = (call: string, resultVariable: string): string =>
  resultVariable ? `const ${resultVariable} = ${call};` : `${call};`;

const callAiImageAction: IActionDescriptor = {
  name: CALL_AI_IMAGE_NAME,
  label: 'openai:action.callAiImage',
  editorType: 'sidebar',
  fields: [
    { name: 'integration', label: 'openai:field.integration', kind: 'credential-ref', vendor: OPENAI_VENDOR },
    {
      name: 'model',
      label: 'openai:field.model',
      kind: 'select',
      vendor: OPENAI_VENDOR,
      loadOptions: (fields, ctx) => fetchOpenAiModelOptions(fields, ctx?.egress, ['image', 'dall-e', 'gpt-image']),
    },
    { name: 'prompt', label: 'openai:field.prompt', kind: 'template-string' },
    {
      name: 'size',
      label: 'openai:field.size',
      kind: 'select',
      options: IMAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: size })),
    },
    { name: 'resultVariable', label: 'openai:field.resultVariable', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await callAiImage(${fields.integration}, ${fields.model}, ${fields.prompt}, ${fields.size})`,
      fields.resultVariable,
    ),
  activitySignature: `callAiImage(credentialId: string, model: string, prompt: string, size: string): Promise<${FILE_REF_TYPE}>`,
  // `response_format: 'b64_json'` is OpenAI's own shape — some OpenAI-*compatible* servers reject the
  // field entirely (400). Retried once without it; if the server then answers with a `url` instead of
  // `b64_json`, that URL is downloaded directly rather than treated as a second vendor quirk to guard.
  activityCode: [
    'export const callAiImage = async (',
    '  credentialId: string,',
    '  model: string,',
    '  prompt: string,',
    '  size: string,',
    '): Promise<IFileRef> => {',
    "  const baseUrl = await resolveOpenAiField(credentialId, 'baseUrl');",
    "  const apiKey = await resolveOpenAiField(credentialId, 'apiKey');",
    '  const requestBody = (includeResponseFormat: boolean): string =>',
    '    JSON.stringify({',
    '      model,',
    '      prompt,',
    "      size: size || 'auto',",
    "      ...(includeResponseFormat ? { response_format: 'b64_json' } : {}),",
    '    });',
    '  const post = (body: string): Promise<Response> =>',
    '    fetch(`${baseUrl}/images/generations`, {',
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },",
    '      body,',
    '    });',
    '  let response = await post(requestBody(true));',
    '  if (response.status === 400) {',
    '    const errorText = await response.text();',
    "    if (!errorText.includes('response_format')) {",
    '      throw new Error(`OpenAI image generation failed: 400 ${errorText}`);',
    '    }',
    '    response = await post(requestBody(false));',
    '  }',
    '  if (!response.ok) {',
    '    throw new Error(`OpenAI image generation failed: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { data: { b64_json?: string; url?: string }[] };',
    '  const first = data.data[0];',
    '  if (!first) throw new Error(\'OpenAI image generation: empty "data" array in response\');',
    '  let bytes: Uint8Array;',
    '  if (first.b64_json) {',
    "    bytes = Buffer.from(first.b64_json, 'base64');",
    '  } else if (first.url) {',
    '    const downloaded = await fetch(first.url);',
    '    if (!downloaded.ok) {',
    '      throw new Error(`OpenAI image generation: failed to download ${first.url}: ${downloaded.status}`);',
    '    }',
    '    bytes = new Uint8Array(await downloaded.arrayBuffer());',
    '  } else {',
    '    throw new Error(\'OpenAI image generation: response has neither "b64_json" nor "url"\');',
    '  }',
    "  return openaiUploadFileFromStream(bytes, { name: 'image.png', mime: 'image/png' });",
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: fileTypeInfo(),
};

const callAiTranscribeAction: IActionDescriptor = {
  name: CALL_AI_TRANSCRIBE_NAME,
  label: 'openai:action.callAiTranscribe',
  editorType: 'sidebar',
  fields: [
    { name: 'integration', label: 'openai:field.integration', kind: 'credential-ref', vendor: OPENAI_VENDOR },
    { name: 'file', label: 'openai:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'model', label: 'openai:field.transcribeModel', kind: 'text' },
    { name: 'language', label: 'openai:field.language', kind: 'text' },
    { name: 'resultVariable', label: 'openai:field.resultVariable', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await callAiTranscribe(${fields.integration}, ${fields.file}, ${fields.model}, ${fields.language})`,
      fields.resultVariable,
    ),
  activitySignature: `callAiTranscribe(credentialId: string, file: ${FILE_REF_TYPE}, model: string, language: string): Promise<string>`,
  // Multipart via `FormData`/`Blob` — Node's own `fetch` (undici) builds the boundary/`Content-Type`
  // header itself; setting one manually would drop the boundary parameter and break the upload.
  activityCode: [
    'export const callAiTranscribe = async (',
    '  credentialId: string,',
    '  file: IFileRef,',
    '  model: string,',
    '  language: string,',
    '): Promise<string> => {',
    "  const baseUrl = await resolveOpenAiField(credentialId, 'baseUrl');",
    "  const apiKey = await resolveOpenAiField(credentialId, 'apiKey');",
    '  const bytes = await openaiReadFileBytes(file, 25 * 1024 * 1024);',
    '  const formData = new FormData();',
    // `Buffer.from(bytes)` (not the bare `Uint8Array`) — `Blob`'s `BlobPart` type wants an
    // `ArrayBufferView<ArrayBuffer>`, and `readFileBytes`'s `Uint8Array` is typed over the wider
    // `ArrayBufferLike` (which also covers `SharedArrayBuffer`); `Buffer` is always real-`ArrayBuffer`-backed.
    "  formData.append('file', new Blob([Buffer.from(bytes)], { type: file.mime }), file.name);",
    "  formData.append('model', model || 'whisper-1');",
    "  formData.append('response_format', 'json');",
    "  if (language) formData.append('language', language);",
    '  const response = await fetch(`${baseUrl}/audio/transcriptions`, {',
    "    method: 'POST',",
    '    headers: { Authorization: `Bearer ${apiKey}` },',
    '    body: formData,',
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`OpenAI transcription failed: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { text: string };',
    '  return data.text;',
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: { type: 'string' },
};

export const openaiMediaActions: readonly IActionDescriptor[] = [callAiImageAction, callAiTranscribeAction];

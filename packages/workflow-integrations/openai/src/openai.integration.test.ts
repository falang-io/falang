import {
  buildActionNodeConfig,
  buildChoiceNodeConfig,
  getIntegrationNodeConfigs,
} from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import {
  CALL_AI_CHOICE_NAME,
  CALL_AI_IMAGE_NAME,
  CALL_AI_TEXT_NAME,
  CALL_AI_TRANSCRIBE_NAME,
  openaiIntegration,
} from './openai.integration.js';

describe('openaiIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([openaiIntegration]);
    expect(configs.map((config) => config.name)).toEqual([
      CALL_AI_TEXT_NAME,
      CALL_AI_IMAGE_NAME,
      CALL_AI_TRANSCRIBE_NAME,
    ]);
  });

  it('call-ai-text data schema accepts the declared fields, including attachments', () => {
    const config = buildActionNodeConfig(openaiIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      integration: 'cred-1',
      model: 'gpt-4o-mini',
      prompt: '`Summarize: ${message.text}`',
      attachments: 'myFiles',
      result: '{"type":"string"}',
      resultVariable: 'aiReply',
    });
    expect(parsed).toEqual({
      integration: 'cred-1',
      model: 'gpt-4o-mini',
      prompt: '`Summarize: ${message.text}`',
      attachments: 'myFiles',
      result: '{"type":"string"}',
      resultVariable: 'aiReply',
    });
  });

  it('call-ai-text opens in a sidebar, unlike the default inline action editor', () => {
    expect(openaiIntegration.actions[0].editorType).toBe('sidebar');
  });

  it('emit() assigns the call to resultVariable when one is set, defaulting attachments to []', () => {
    const emitted = openaiIntegration.actions[0].emit({
      integration: "'cred-1'",
      model: "'gpt-4o-mini'",
      prompt: '`hello`',
      attachments: '',
      result: '{"type":"string"}',
      resultVariable: 'aiReply',
    });
    expect(emitted).toBe("const aiReply = (await callAiText('cred-1', 'gpt-4o-mini', `hello`, [])).text;");
  });

  it('emit() passes a non-empty attachments expression through verbatim', () => {
    const emitted = openaiIntegration.actions[0].emit({
      integration: "'cred-1'",
      model: "'gpt-4o-mini'",
      prompt: '`hello`',
      attachments: 'myFiles',
      result: '{"type":"string"}',
      resultVariable: 'aiReply',
    });
    expect(emitted).toBe("const aiReply = (await callAiText('cred-1', 'gpt-4o-mini', `hello`, myFiles)).text;");
  });

  it('emit() omits the assignment when resultVariable is empty (never edited)', () => {
    const emitted = openaiIntegration.actions[0].emit({
      integration: "'cred-1'",
      model: "'gpt-4o-mini'",
      prompt: '`hello`',
      attachments: '',
      result: '{"type":"string"}',
      resultVariable: '',
    });
    expect(emitted).toBe("await callAiText('cred-1', 'gpt-4o-mini', `hello`, []);");
  });

  it('emit() defaults an empty result value to text (never edited)', () => {
    const emitted = openaiIntegration.actions[0].emit({
      integration: "'cred-1'",
      model: "'gpt-4o-mini'",
      prompt: '`hello`',
      attachments: '',
      result: '',
      resultVariable: 'aiReply',
    });
    expect(emitted).toBe("const aiReply = (await callAiText('cred-1', 'gpt-4o-mini', `hello`, [])).text;");
  });

  it('emit() throws a clear error for a struct result — compiler struct resolution not implemented yet', () => {
    expect(() =>
      openaiIntegration.actions[0].emit({
        integration: "'cred-1'",
        model: "'gpt-4o-mini'",
        prompt: '`hello`',
        attachments: '',
        result: '{"type":"struct","id":"some/Struct"}',
        resultVariable: 'aiReply',
      }),
    ).toThrow(/structured output/i);
  });

  describe('resultType', () => {
    const rawResultType = openaiIntegration.actions[0].resultType;
    if (typeof rawResultType !== 'function') throw new Error('expected call-ai-text resultType to be a function');
    const resultType = rawResultType;

    it("is a function of the node's own field values", () => {
      expect(typeof rawResultType).toBe('function');
    });

    it('regression: resultVariable is still typed a constant string in scope for a plain text result', () => {
      expect(
        resultType({
          integration: 'cred-1',
          model: 'gpt-4o-mini',
          prompt: '`hi`',
          result: '{"type":"string"}',
          resultVariable: 'answer',
        }),
      ).toEqual({ type: 'string', constant: true });
    });

    it('defaults to a constant string when result is empty (never edited)', () => {
      expect(resultType({ integration: '', model: '', prompt: '', result: '', resultVariable: '' })).toEqual({
        type: 'string',
        constant: true,
      });
    });

    it('resolves to a constant struct type when result picks a struct', () => {
      expect(
        resultType({
          integration: 'cred-1',
          model: 'gpt-4o-mini',
          prompt: '`hi`',
          result: '{"type":"struct","id":"some/Struct"}',
          resultVariable: 'answer',
        }),
      ).toEqual({ type: 'struct', id: 'some/Struct', constant: true });
    });
  });

  it('activityCode is a self-contained, parseable TS module fragment', () => {
    expect(openaiIntegration.actions[0].activityCode).toContain('export const callAiText');
    expect(openaiIntegration.actions[0].activityCode).toContain('chat/completions');
  });

  it('activityCode builds an array content only when attachments are present, plain string otherwise', () => {
    expect(openaiIntegration.actions[0].activityCode).toContain('attachments.length > 0');
    expect(openaiIntegration.actions[0].activityCode).toContain('buildAiAttachmentParts(attachments)');
    expect(openaiIntegration.actions[0].activityCode).toContain(': prompt;');
  });

  it('runs a regular (task-queue) activity with a 10-minute timeout, not the 10s local default', () => {
    expect(openaiIntegration.actions[0].activityOptions).toEqual({
      kind: 'regular',
      startToCloseTimeout: '10 minutes',
    });
  });

  it('credentialFields declares apiKey as a secret with an optional prod value', () => {
    expect(openaiIntegration.credentialFields).toEqual([
      { name: 'baseUrl', label: 'openai:credentialField.baseUrl', kind: 'text' },
      { name: 'apiKey', label: 'openai:credentialField.apiKey', kind: 'secret', secretProdOptional: true },
    ]);
  });

  it("model field's loadOptions calls the provider /models endpoint with the resolved credential fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const modelField = openaiIntegration.actions[0].fields.find((field) => field.name === 'model');
      const options = await modelField?.loadOptions?.({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' });
      expect(options).toEqual([
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        { value: 'gpt-4o', label: 'gpt-4o' },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-test' } }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('call-ai-choice', () => {
    const choice = openaiIntegration.choices?.[0];

    it('is registered with the expected name', () => {
      expect(choice?.name).toBe(CALL_AI_CHOICE_NAME);
    });

    it('splits header fields into contextFields (bot/model) and promptFields (prompt/attachments)', () => {
      expect(choice?.contextFields.map((field) => field.name)).toEqual(['integration', 'model']);
      expect(choice?.promptFields.map((field) => field.name)).toEqual(['prompt', 'attachments']);
    });

    it('produces a header + option node config seeded with 2 default string-typed options', () => {
      const [header, option] = choice ? buildChoiceNodeConfig(choice) : [];
      expect(header?.name).toBe(CALL_AI_CHOICE_NAME);
      expect(option?.name).toBe(`${CALL_AI_CHOICE_NAME}-option`);
      const seeded = header?.factory?.();
      expect(seeded?.children).toHaveLength(2);
      expect(seeded?.children?.map((child) => child.data)).toEqual([
        { alias: 'Option 1', dataType: { type: 'string' }, variable: 'data' },
        { alias: 'Option 2', dataType: { type: 'string' }, variable: 'data' },
      ]);
    });

    it('activitySignature carries attachments right before the compiler-appended schema argument', () => {
      expect(choice?.activitySignature).toContain('attachments: readonly { id: string');
      expect(choice?.activitySignature?.indexOf('attachments')).toBeLessThan(
        choice?.activitySignature?.indexOf('schema: unknown') ?? -1,
      );
    });

    // Regression test (ADR 0038 (private) §6 / the real e2e failure it caused): `attachments`
    // reaches this activity through `@falang/workflow-compiler`'s generic choice-arg-joining
    // (`choice-emitters.ts`), which has no per-field hook to substitute a `'[]'` default the way
    // `callAiText`'s own action `emit` does — a node whose `data` has no `attachments` key (an older
    // document predating the field) compiles the argument to the literal `undefined`, so the
    // activity's own parameter type must accept it.
    it("activitySignature's attachments parameter accepts undefined (a blank/missing field compiles to the literal `undefined`, not `[]`)", () => {
      expect(choice?.activitySignature).toContain('attachments: readonly { id: string');
      expect(choice?.activitySignature).toMatch(/attachments: readonly \{[^}]+\}\[\] \| undefined/);
    });

    it('activityCode references the shared field resolver rather than redeclaring it', () => {
      expect(choice?.activityCode).toContain("await resolveOpenAiField(credentialId, 'baseUrl')");
      expect(choice?.activityCode).not.toContain('const resolveOpenAiField');
    });

    it('activityCode wraps the schema under a top-level "result" object and unwraps the response', () => {
      expect(choice?.activityCode).toContain('properties: { result: schema }');
      expect(choice?.activityCode).toContain('json_schema');
      expect(choice?.activityCode).toContain('...parsed.result');
    });

    it('activityCode builds an array content only when attachments are present, plain string otherwise', () => {
      expect(choice?.activityCode).toContain('resolvedAttachments.length > 0');
      expect(choice?.activityCode).toContain('buildAiAttachmentParts(resolvedAttachments)');
    });

    it('activityCode defaults a possibly-undefined attachments parameter to [] before using it', () => {
      expect(choice?.activityCode).toContain('const resolvedAttachments = attachments ?? [];');
    });

    it('runs a regular activity with a 10-minute timeout', () => {
      expect(choice?.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '10 minutes' });
    });
  });

  it('sharedActivityCode declares resolveOpenAiField/buildAiAttachmentParts exactly once, reused by every action', () => {
    expect(openaiIntegration.sharedActivityCode).toContain('const resolveOpenAiField');
    expect(openaiIntegration.sharedActivityCode).toContain('const buildAiAttachmentParts');
    expect(openaiIntegration.actions[0].activityCode).not.toContain('const resolveOpenAiField');
    expect(openaiIntegration.actions[0].activityCode).not.toContain('const buildAiAttachmentParts');
  });

  it('sharedActivityCode imports the files package helpers (real import, unlike activitySignature)', () => {
    expect(openaiIntegration.sharedActivityCode).toContain(
      "import type { IFileRef } from '@falang/workflow-integrations-files';",
    );
    expect(openaiIntegration.sharedActivityCode).toContain(
      'fileToDataUrl, readFileBytes as openaiReadFileBytes, uploadFileFromStream as openaiUploadFileFromStream',
    );
  });
});

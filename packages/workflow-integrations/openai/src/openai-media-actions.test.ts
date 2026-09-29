import { describe, expect, it, vi } from 'vitest';
import { CALL_AI_IMAGE_NAME, CALL_AI_TRANSCRIBE_NAME, openaiIntegration } from './openai.integration.js';

describe('openai media actions', () => {
  describe('call-ai-image', () => {
    const action = openaiIntegration.actions.find((candidate) => candidate.name === CALL_AI_IMAGE_NAME);
    if (!action) throw new Error('expected call-ai-image to be registered');

    it('declares integration/model/prompt/size/resultVariable fields', () => {
      expect(action.fields.map((field) => field.name)).toEqual([
        'integration',
        'model',
        'prompt',
        'size',
        'resultVariable',
      ]);
    });

    it("model field's loadOptions narrows to image-ish models, falling back to the full list", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4o-mini' }, { id: 'dall-e-3' }, { id: 'gpt-image-1' }] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const modelField = action.fields.find((field) => field.name === 'model');
        const options = await modelField?.loadOptions?.({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' });
        expect(options).toEqual([
          { value: 'dall-e-3', label: 'dall-e-3' },
          { value: 'gpt-image-1', label: 'gpt-image-1' },
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("model field's loadOptions falls back to the full list when nothing matches the image keywords", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'some-model' }] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      try {
        const modelField = action.fields.find((field) => field.name === 'model');
        const options = await modelField?.loadOptions?.({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' });
        expect(options).toEqual([{ value: 'some-model', label: 'some-model' }]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('size field offers the four declared sizes', () => {
      const sizeField = action.fields.find((field) => field.name === 'size');
      expect(sizeField?.options).toEqual([
        { value: '1024x1024', label: '1024x1024' },
        { value: '1024x1536', label: '1024x1536' },
        { value: '1536x1024', label: '1536x1024' },
        { value: 'auto', label: 'auto' },
      ]);
    });

    it('emit() builds the call and assigns the result', () => {
      const emitted = action.emit({
        integration: "'cred-1'",
        model: "'dall-e-3'",
        prompt: '`a cat`',
        size: "'1024x1024'",
        resultVariable: 'image',
      });
      expect(emitted).toBe("const image = await callAiImage('cred-1', 'dall-e-3', `a cat`, '1024x1024');");
    });

    it('activitySignature/resultType report a File struct, never inline bytes', () => {
      expect(action.activitySignature).toContain('Promise<{ id: string; name: string; size: number');
      expect(action.resultType).toEqual({ type: 'struct', id: 'files/File' });
    });

    it('activityCode retries once without response_format on a 400 that mentions it, and downloads a bare url', () => {
      expect(action.activityCode).toContain('response.status === 400');
      expect(action.activityCode).toContain("errorText.includes('response_format')");
      expect(action.activityCode).toContain('openaiUploadFileFromStream(bytes,');
    });

    it('runs a regular activity with a 10-minute timeout', () => {
      expect(action.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '10 minutes' });
    });
  });

  describe('call-ai-transcribe', () => {
    const action = openaiIntegration.actions.find((candidate) => candidate.name === CALL_AI_TRANSCRIBE_NAME);
    if (!action) throw new Error('expected call-ai-transcribe to be registered');

    it('declares integration/file/model/language/resultVariable fields', () => {
      expect(action.fields.map((field) => field.name)).toEqual([
        'integration',
        'file',
        'model',
        'language',
        'resultVariable',
      ]);
    });

    it('file field expects a File struct', () => {
      const fileField = action.fields.find((field) => field.name === 'file');
      expect(fileField?.expectedType).toEqual({ type: 'struct', id: 'files/File' });
    });

    it('emit() builds the call and assigns the result', () => {
      const emitted = action.emit({
        integration: "'cred-1'",
        file: 'voiceFile',
        model: "'whisper-1'",
        language: "''",
        resultVariable: 'text',
      });
      expect(emitted).toBe("const text = await callAiTranscribe('cred-1', voiceFile, 'whisper-1', '');");
    });

    it('activitySignature/resultType report a plain string', () => {
      expect(action.activitySignature).toContain('): Promise<string>');
      expect(action.resultType).toEqual({ type: 'string' });
    });

    it('activityCode sends multipart via FormData/Blob, defaulting model to whisper-1', () => {
      expect(action.activityCode).toContain('new FormData()');
      expect(action.activityCode).toContain('new Blob([Buffer.from(bytes)], { type: file.mime })');
      expect(action.activityCode).toContain("model || 'whisper-1'");
      expect(action.activityCode).toContain('audio/transcriptions');
    });

    it('runs a regular activity with a 10-minute timeout', () => {
      expect(action.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '10 minutes' });
    });
  });
});

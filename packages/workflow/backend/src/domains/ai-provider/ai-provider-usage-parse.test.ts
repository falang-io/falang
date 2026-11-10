import { describe, expect, it } from 'vitest';
import { readChatUsage, readImageUsage, readTranscriptionUsage } from './ai-provider-usage-parse.js';

const json = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value));

describe('built-in AI provider usage readers (ADR 0081)', () => {
  it('chat: prompt/completion/total and cached prompt tokens; null without usage or for non-JSON', () => {
    expect(
      readChatUsage(
        json({
          usage: {
            prompt_tokens: 10,
            completion_tokens: 3,
            total_tokens: 13,
            prompt_tokens_details: { cached_tokens: 4 },
          },
        }),
      ),
    ).toEqual({ promptTokens: 10, completionTokens: 3, totalTokens: 13, cachedPromptTokens: 4 });
    expect(readChatUsage(json({ choices: [] }))).toBeNull();
    expect(readChatUsage(Buffer.from('not json'))).toBeNull();
  });

  it('image: gpt-image token usage plus the number of images', () => {
    expect(
      readImageUsage(
        json({
          data: [{ b64_json: 'a' }, { b64_json: 'b' }],
          usage: {
            input_tokens: 50,
            input_tokens_details: { image_tokens: 40, text_tokens: 10, cached_tokens: 8 },
            output_tokens: 4160,
            total_tokens: 4210,
          },
        }),
      ),
    ).toEqual({ promptTokens: 50, completionTokens: 4160, totalTokens: 4210, cachedPromptTokens: 8, images: 2 });
  });

  it('image: a reply without usage (DALL·E) still carries the image count, tokens 0', () => {
    expect(readImageUsage(json({ data: [{ url: 'https://x/1.png' }] }))).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      images: 1,
    });
    expect(readImageUsage(json({ usage: { input_tokens: 1, output_tokens: 2 } }))).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    expect(readImageUsage(json({ created: 1 }))).toBeNull();
    expect(readImageUsage(Buffer.from('<html>'))).toBeNull();
  });

  it('transcription: duration usage (whisper-1) → audioSeconds, token usage → tokens', () => {
    expect(readTranscriptionUsage(json({ text: 'hi', usage: { type: 'duration', seconds: 7.5 } }))).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      audioSeconds: 7.5,
    });
    expect(
      readTranscriptionUsage(
        json({
          text: 'hi',
          usage: {
            type: 'tokens',
            input_tokens: 14,
            input_token_details: { audio_tokens: 10, text_tokens: 4 },
            output_tokens: 45,
            total_tokens: 59,
          },
        }),
      ),
    ).toEqual({ promptTokens: 14, completionTokens: 45, totalTokens: 59 });
    expect(readTranscriptionUsage(json({ text: 'hi' }))).toBeNull();
    expect(readTranscriptionUsage(json({ text: 'hi', usage: { type: 'duration', seconds: 'x' } }))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { BUILT_IN_AI_PROVIDER_UNSUPPORTED_ACTIONS, isUnsupportedOnBuiltInAiProvider } from './built-in-ai-provider.js';

const instances = [{ id: 'own' }, { id: 'platform', platformProvider: true as const }];

describe('isUnsupportedOnBuiltInAiProvider (ADR 0081)', () => {
  it('lists the image and transcription actions', () => {
    expect([...BUILT_IN_AI_PROVIDER_UNSUPPORTED_ACTIONS].toSorted()).toEqual(['call-ai-image', 'call-ai-transcribe']);
  });

  it('is true only for an unsupported action whose selected instance runs on the built-in provider', () => {
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-image', 'platform', instances)).toBe(true);
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-transcribe', 'platform', instances)).toBe(true);
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-image', 'own', instances)).toBe(false);
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-text', 'platform', instances)).toBe(false);
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-image', '', instances)).toBe(false);
    expect(isUnsupportedOnBuiltInAiProvider('call-ai-image', 'missing', instances)).toBe(false);
  });
});

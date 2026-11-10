import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_BODY_LIMIT, bodyLimitFor, LARGE_BODY_LIMIT } from './body-limits.js';

describe('bodyLimitFor', () => {
  it('gives the AI provider relay 30 MB without loosening other routes', () => {
    expect(bodyLimitFor('/internal/ai-provider/p1/dev/chat/completions')).toBe(AI_PROVIDER_BODY_LIMIT);
    expect(AI_PROVIDER_BODY_LIMIT).toBe('30mb');
    expect(bodyLimitFor('/internal/projects/p1/run-journal')).toBe(LARGE_BODY_LIMIT);
    expect(bodyLimitFor('/internal/ai-providerx')).toBe(LARGE_BODY_LIMIT);
    expect(bodyLimitFor('/projects/import')).toBe(LARGE_BODY_LIMIT);
    expect(bodyLimitFor('/projects/p1/agent/chat')).toBe(LARGE_BODY_LIMIT);
    expect(bodyLimitFor('/auth/login')).toBeNull();
    expect(bodyLimitFor('/ai-provider')).toBeNull();
  });
});

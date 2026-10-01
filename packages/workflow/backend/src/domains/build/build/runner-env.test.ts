import { describe, expect, it } from 'vitest';
import { buildRunnerEnv } from './runner-env.js';
import type { IRunnerProcessManagerParams } from './runner-process-manager.js';

describe('buildRunnerEnv', () => {
  it('never puts the shared activepieces service secret into a runner pod, even when it is configured', () => {
    process.env.ACTIVEPIECES_SERVICE_SECRET = 'shared-secret';
    try {
      const env = buildRunnerEnv(
        { activepiecesServiceUrl: 'http://activepieces:4100' } as IRunnerProcessManagerParams,
        { taskQueue: 'q', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' },
      );
      expect(env.ACTIVEPIECES_SERVICE_URL).toBe('http://activepieces:4100');
      expect(Object.keys(env)).not.toContain('ACTIVEPIECES_SERVICE_SECRET');
      expect(Object.values(env)).not.toContain('shared-secret');
      expect(env.INTERNAL_PROJECT_TOKEN).toBe('t');
    } finally {
      delete process.env.ACTIVEPIECES_SERVICE_SECRET;
    }
  });
});

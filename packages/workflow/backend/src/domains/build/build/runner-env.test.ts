// oxlint-disable no-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
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

  describe('Temporal tenant isolation (ADR 0050 (private))', () => {
    const perProject = {
      mode: 'per-project' as const,
      namespaceFor: (projectId: string) => `falang-${projectId}`,
      ensureNamespace: () => Promise.resolve(),
    };
    const call = { taskQueue: 'q', projectId: 'p1', internalProjectToken: 't', workflowEnv: 'dev' as const };

    it('shared mode leaves the env exactly as it was before isolation existed', () => {
      const managerParams = {
        temporalAddress: 'temporal:7233',
        namespace: 'prod',
        internalApiUrl: 'http://backend:3001',
        tenancy: { ...perProject, mode: 'shared' as const, namespaceFor: () => 'prod' },
      } as Partial<IRunnerProcessManagerParams> as IRunnerProcessManagerParams;
      const without = { ...managerParams, tenancy: undefined } as IRunnerProcessManagerParams;

      expect(buildRunnerEnv(managerParams, call)).toEqual(buildRunnerEnv(without, call));
      const env = buildRunnerEnv(managerParams, call);
      expect(env.TEMPORAL_NAMESPACE).toBe('prod');
      expect(env).not.toHaveProperty('TEMPORAL_TOKEN_URL');
      expect(env).not.toHaveProperty('TEMPORAL_TLS');
    });

    it('per-project mode points the pod at its own namespace and token endpoint, plaintext by default', () => {
      const env = buildRunnerEnv(
        {
          temporalAddress: 'temporal:7233',
          namespace: 'default',
          internalApiUrl: 'http://backend:3001/',
          tenancy: perProject,
        } as Partial<IRunnerProcessManagerParams> as IRunnerProcessManagerParams,
        call,
      );

      expect(env.TEMPORAL_ADDRESS).toBe('temporal:7233');
      expect(env.TEMPORAL_NAMESPACE).toBe('falang-p1');
      expect(env.TEMPORAL_TOKEN_URL).toBe('http://backend:3001/internal/projects/p1/temporal-token');
      expect(env.TEMPORAL_TLS).toBe('false');
      expect(env.INTERNAL_PROJECT_TOKEN).toBe('t');
    });

    it('per-project mode passes TEMPORAL_TLS=true through when the frontend terminates TLS', () => {
      const env = buildRunnerEnv(
        { internalApiUrl: 'http://backend:3001', tenancy: perProject, temporalTls: true } as Partial<IRunnerProcessManagerParams> as IRunnerProcessManagerParams,
        call,
      );

      expect(env.TEMPORAL_TLS).toBe('true');
    });

    it('gives two projects different namespaces and token URLs', () => {
      const params = { internalApiUrl: 'http://backend:3001', tenancy: perProject } as Partial<IRunnerProcessManagerParams> as IRunnerProcessManagerParams;

      const a = buildRunnerEnv(params, call);
      const b = buildRunnerEnv(params, { ...call, projectId: 'p2' });

      expect(a.TEMPORAL_NAMESPACE).not.toBe(b.TEMPORAL_NAMESPACE);
      expect(a.TEMPORAL_TOKEN_URL).not.toBe(b.TEMPORAL_TOKEN_URL);
    });
  });
});

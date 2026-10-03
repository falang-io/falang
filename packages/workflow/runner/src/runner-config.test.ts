import { describe, expect, it } from 'vitest';
import { readRunnerConfigFromEnv } from './runner-config.js';

describe('readRunnerConfigFromEnv', () => {
  it('reads the required and optional fields from the given env', () => {
    const env = {
      ARTIFACT_BASE_URL: 'http://backend.workflow.svc.cluster.local:4000',
      PROJECT_ID: 'project-1',
      INTERNAL_PROJECT_TOKEN: 'token-1',
      TASK_QUEUE: 'workflow-42',
      TEMPORAL_ADDRESS: 'temporal.internal:7233',
      TEMPORAL_NAMESPACE: 'prod',
      DEPLOYMENT_NAME: 'workflow-42',
      BUILD_ID: 'v1',
    };
    expect(readRunnerConfigFromEnv(env)).toEqual({
      artifactBaseUrl: 'http://backend.workflow.svc.cluster.local:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
      taskQueue: 'workflow-42',
      temporalAddress: 'temporal.internal:7233',
      namespace: 'prod',
      deploymentName: 'workflow-42',
      buildId: 'v1',
      internalServiceUrls: [],
    });
  });

  it('leaves optional fields unset when not present in the env', () => {
    const env = {
      ARTIFACT_BASE_URL: 'http://backend:4000',
      PROJECT_ID: 'project-1',
      INTERNAL_PROJECT_TOKEN: 'token-1',
      TASK_QUEUE: 'workflow-42',
    };
    const config = readRunnerConfigFromEnv(env);
    expect(config).toEqual({
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
      taskQueue: 'workflow-42',
      internalServiceUrls: [],
    });
    expect(config.temporalAddress).toBeUndefined();
    expect(config.namespace).toBeUndefined();
    expect(config.deploymentName).toBeUndefined();
    expect(config.buildId).toBeUndefined();
  });

  it('reads the per-project Temporal token URL and TLS flag (ADR 0057 (private))', () => {
    const env = {
      ARTIFACT_BASE_URL: 'http://backend:3001',
      PROJECT_ID: 'p1',
      INTERNAL_PROJECT_TOKEN: 't',
      TASK_QUEUE: 'workflow-p1',
      TEMPORAL_NAMESPACE: 'falang-p1',
      TEMPORAL_TOKEN_URL: 'http://backend:3001/internal/projects/p1/temporal-token',
      TEMPORAL_TLS: 'false',
    };

    expect(readRunnerConfigFromEnv(env)).toMatchObject({
      namespace: 'falang-p1',
      temporalTokenUrl: 'http://backend:3001/internal/projects/p1/temporal-token',
      temporalTls: false,
    });
    expect(readRunnerConfigFromEnv({ ...env, TEMPORAL_TLS: 'true' }).temporalTls).toBe(true);
  });

  it('throws listing every missing required variable', () => {
    expect(() => readRunnerConfigFromEnv({})).toThrow(
      /ARTIFACT_BASE_URL.*PROJECT_ID.*INTERNAL_PROJECT_TOKEN.*TASK_QUEUE/,
    );
  });

  it('throws when only one required variable is missing', () => {
    expect(() =>
      readRunnerConfigFromEnv({
        ARTIFACT_BASE_URL: 'http://backend:4000',
        PROJECT_ID: 'project-1',
        INTERNAL_PROJECT_TOKEN: 'token-1',
      }),
    ).toThrow(/TASK_QUEUE/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DeploymentCliService, type TRunTemporalCli } from './deployment-cli.service.js';

const createRunCliMock = () => vi.fn<TRunTemporalCli>(() => Promise.resolve({ stdout: '', stderr: '' }));

describe('DeploymentCliService', () => {
  it('runs "worker deployment set-current-version" with the given deployment name and build ID', async () => {
    const runCli = createRunCliMock();
    const service = new DeploymentCliService({ runCli });

    await service.setCurrentVersion('workflow-42', 'v3');

    expect(runCli).toHaveBeenCalledWith(
      [
        'worker',
        'deployment',
        'set-current-version',
        '--deployment-name',
        'workflow-42',
        '--build-id',
        'v3',
        '--yes',
      ],
      expect.anything(),
    );
  });

  it('includes TEMPORAL_ADDRESS/TEMPORAL_NAMESPACE in the env only when provided', async () => {
    const runCli = createRunCliMock();
    const service = new DeploymentCliService({ runCli, temporalAddress: 'temporal.internal:7233', namespace: 'prod' });

    await service.setCurrentVersion('workflow-42', 'v3');

    const call = runCli.mock.calls[0];
    if (!call) throw new Error('runCli was not called');
    expect(call[1].TEMPORAL_ADDRESS).toBe('temporal.internal:7233');
    expect(call[1].TEMPORAL_NAMESPACE).toBe('prod');
  });

  it('propagates a rejection from runCli', async () => {
    const runCli = vi.fn<TRunTemporalCli>(() => Promise.reject(new Error('exit code 1')));
    const service = new DeploymentCliService({ runCli });

    await expect(service.setCurrentVersion('workflow-42', 'v3')).rejects.toThrow('exit code 1');
  });

  it('setCurrentVersionWithRetry retries after a failure and succeeds once runCli stops rejecting', async () => {
    vi.useFakeTimers();
    try {
      const runCli = vi
        .fn<TRunTemporalCli>()
        .mockRejectedValueOnce(new Error('not registered yet'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      const service = new DeploymentCliService({ runCli });

      const resultPromise = service.setCurrentVersionWithRetry('workflow-42', 'v3');
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(runCli).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setCurrentVersionWithRetry throws once every attempt has been exhausted', async () => {
    vi.useFakeTimers();
    try {
      const runCli = vi.fn<TRunTemporalCli>(() => Promise.reject(new Error('still not registered')));
      const service = new DeploymentCliService({ runCli });

      const resultPromise = service.setCurrentVersionWithRetry('workflow-42', 'v3');
      const assertion = expect(resultPromise).rejects.toThrow('still not registered');
      await vi.runAllTimersAsync();
      await assertion;

      expect(runCli).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

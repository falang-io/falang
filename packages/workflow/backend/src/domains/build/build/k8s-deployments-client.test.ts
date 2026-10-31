import { describe, expect, it, vi } from 'vitest';
import { pickDeploymentsClient, type IK8sDeploymentsClient } from './k8s-deployments-client.js';

const fake = (): IK8sDeploymentsClient => ({ apply: vi.fn(), delete: vi.fn() }) as unknown as IK8sDeploymentsClient;

describe('pickDeploymentsClient', () => {
  it('uses the override and never builds the k8s client', () => {
    const override = fake();
    const createK8s = vi.fn(fake);
    expect(pickDeploymentsClient(override, createK8s)).toBe(override);
    expect(createK8s).not.toHaveBeenCalled();
  });
  it('builds the k8s client when there is no override', () => {
    const built = fake();
    expect(pickDeploymentsClient(null, () => built)).toBe(built);
  });
});

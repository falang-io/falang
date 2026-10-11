import { describe, expect, it } from 'vitest';
import { AgentQuotaError } from './agent/agent-quota-error.js';
import { ApiCodedError } from './api-coded-error.js';
import { describeStartError, startErrorKey } from './start-error-message.js';

const t = (key: string): string => `T:${key}`;

describe('start error mapping', () => {
  it('maps a 423 project_suspended by its reason', () => {
    const balance = new ApiCodedError('suspended', 'project_suspended', {
      code: 'project_suspended',
      reason: 'balance',
    });
    const admin = new ApiCodedError('suspended', 'project_suspended', { code: 'project_suspended', reason: 'admin' });
    expect(startErrorKey(balance)).toBe('client:start-errors.suspended-balance');
    expect(startErrorKey(admin)).toBe('client:start-errors.suspended-admin');
  });

  it('maps a 402 insufficient_balance', () => {
    const error = new AgentQuotaError('no money', { statusCode: 402, code: 'insufficient_balance' });
    expect(startErrorKey(error)).toBe('client:start-errors.insufficient-balance');
  });

  it('leaves other errors alone', () => {
    expect(startErrorKey(new ApiCodedError('x', 'not_activated'))).toBeNull();
    expect(startErrorKey(new AgentQuotaError('x', { code: 'agent_credits' }))).toBeNull();
    expect(startErrorKey(new Error('boom'))).toBeNull();
  });

  it('describes with localised text, the error message or the fallback', () => {
    expect(describeStartError(new ApiCodedError('m', 'insufficient_balance'), t, 'f')).toBe(
      'T:client:start-errors.insufficient-balance',
    );
    expect(describeStartError(new Error('boom'), t, 'f')).toBe('boom');
    expect(describeStartError('weird', t, 'f')).toBe('f');
  });
});

// oxlint-disable no-undefined, unicorn/no-useless-undefined -- the disabled state is `undefined` by contract.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW_EXECUTION_TIMEOUT,
  executionTimeoutOptions,
  parseWorkflowExecutionTimeout,
} from './workflow-execution-timeout.js';

describe('parseWorkflowExecutionTimeout', () => {
  it('defaults to 30 days', () => {
    expect(parseWorkflowExecutionTimeout(undefined)).toBe(DEFAULT_WORKFLOW_EXECUTION_TIMEOUT);
  });
  it('accepts ms-style durations', () => {
    expect(parseWorkflowExecutionTimeout('12h')).toBe('12h');
    expect(parseWorkflowExecutionTimeout('7 days')).toBe('7 days');
  });
  it('disables with 0/off/none', () => {
    expect(parseWorkflowExecutionTimeout('0')).toBeUndefined();
    expect(parseWorkflowExecutionTimeout('off')).toBeUndefined();
    expect(parseWorkflowExecutionTimeout('None')).toBeUndefined();
  });
  it('throws on garbage', () => {
    expect(() => parseWorkflowExecutionTimeout('soon')).toThrow(/WORKFLOW_EXECUTION_TIMEOUT/);
  });
});

describe('executionTimeoutOptions', () => {
  it('is empty when disabled and carries the timeout otherwise', () => {
    expect(executionTimeoutOptions(undefined)).toEqual({});
    expect(executionTimeoutOptions('1 day')).toEqual({ workflowExecutionTimeout: '1 day' });
  });
});

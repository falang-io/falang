import { describe, expect, it } from 'vitest';
import {
  createSandboxContextProvider,
  WORKFLOW_RUNTIME_NOTE,
  WorkflowRuntimeContextProvider,
} from './workflow-runtime-context.js';

describe('sandbox note in the agent context', () => {
  it('adds nothing without configured test bots', () => {
    expect(new WorkflowRuntimeContextProvider().describe()).toBe(WORKFLOW_RUNTIME_NOTE);
    expect(new WorkflowRuntimeContextProvider(() => []).describe()).toBe(WORKFLOW_RUNTIME_NOTE);
    expect(createSandboxContextProvider(() => []).describe()).toBe('');
  });

  it('names the configured vendors', () => {
    const text = new WorkflowRuntimeContextProvider(() => ['telegram', 'max']).describe();
    expect(text.startsWith(WORKFLOW_RUNTIME_NOTE)).toBe(true);
    expect(text).toContain('platform test bot for: telegram, max.');
    expect(text).toContain('devSandbox: true');
    expect(createSandboxContextProvider(() => ['vk']).describe()).toContain('for: vk.');
  });
});

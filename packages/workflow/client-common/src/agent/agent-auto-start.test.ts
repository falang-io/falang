import { describe, expect, it } from 'vitest';
import {
  decideAgentAutoStart,
  hasInitialAgentPrompt,
  isEmptyWorkflowProject,
  setInitialAgentPrompt,
  takeInitialAgentPrompt,
  type IAgentAutoStartInput,
} from './agent-auto-start.js';

const base: IAgentAutoStartInput = {
  readOnly: false,
  connectionError: null,
  agentConfigured: true,
  documents: [{ pinned: true }],
  rightPanel: null,
  hasInitialPrompt: false,
};

describe('initial agent prompt hand-off', () => {
  it('is taken once, trimmed', () => {
    setInitialAgentPrompt('p1', '  build a bot  ');
    expect(hasInitialAgentPrompt('p1')).toBe(true);
    expect(takeInitialAgentPrompt('p1')).toBe('build a bot');
    expect(takeInitialAgentPrompt('p1')).toBeNull();
    expect(hasInitialAgentPrompt('p1')).toBe(false);
  });

  it('ignores a blank prompt and keeps projects apart', () => {
    setInitialAgentPrompt('p2', '   ');
    setInitialAgentPrompt('p3', 'x');
    expect(takeInitialAgentPrompt('p2')).toBeNull();
    expect(takeInitialAgentPrompt('p3')).toBe('x');
  });
});

describe('isEmptyWorkflowProject', () => {
  it('counts only pinned documents as empty', () => {
    expect(isEmptyWorkflowProject([])).toBe(true);
    expect(isEmptyWorkflowProject([{ pinned: true }])).toBe(true);
    expect(isEmptyWorkflowProject([{ pinned: true }, {}])).toBe(false);
  });
});

describe('decideAgentAutoStart', () => {
  it('opens the panel for an empty project', () => {
    expect(decideAgentAutoStart(base)).toBe('open');
  });

  it('runs the handed-over prompt even when a panel is already chosen', () => {
    expect(decideAgentAutoStart({ ...base, hasInitialPrompt: true, rightPanel: 'history' })).toBe('run-initial-prompt');
  });

  it('does nothing for a non-empty project or an already open panel', () => {
    expect(decideAgentAutoStart({ ...base, documents: [{ pinned: true }, {}] })).toBe('none');
    expect(decideAgentAutoStart({ ...base, rightPanel: 'history' })).toBe('none');
  });

  it('does nothing read-only, after a failed load or without a configured agent', () => {
    const withPrompt = { ...base, hasInitialPrompt: true };
    expect(decideAgentAutoStart({ ...withPrompt, readOnly: true })).toBe('none');
    expect(decideAgentAutoStart({ ...withPrompt, connectionError: 'boom' })).toBe('none');
    expect(decideAgentAutoStart({ ...withPrompt, agentConfigured: false })).toBe('none');
  });
});

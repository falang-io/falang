import { describe, expect, it } from 'vitest';
import {
  buildConstantsNote,
  createSandboxContextProvider,
  projectConstantsOf,
  WORKFLOW_RUNTIME_NOTE,
  WorkflowRuntimeContextProvider,
} from './workflow-runtime-context.js';

describe('sandbox note in the agent context', () => {
  it('adds nothing without configured test bots', () => {
    const text = new WorkflowRuntimeContextProvider(() => []).describe();
    expect(text).toBe(`${WORKFLOW_RUNTIME_NOTE}\n\n${buildConstantsNote([])}`);
    expect(new WorkflowRuntimeContextProvider().describe()).toBe(text);
    expect(text).not.toContain('platform test bot');
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

describe('constants note in the agent context', () => {
  const documents = [
    { id: 'i', type: 'integrations', name: 'Integrations', folderId: null, pinned: true },
    {
      id: 'c',
      type: 'constants',
      name: 'Constants',
      folderId: null,
      pinned: true,
      customData: {
        constants: [
          { id: '1', name: 'API_URL', type: 'string', dev: 'd', prod: 'p' },
          { id: '2', name: 'LIMIT', type: 'number', dev: 1, prod: 2 },
        ],
      },
    },
  ];

  it('lists the names and types of the project constants, never their values', () => {
    const text = new WorkflowRuntimeContextProvider(
      () => [],
      () => projectConstantsOf({ documents }),
    ).describe();
    expect(text).toContain('Defined: API_URL: string, LIMIT: number.');
    expect(text).toContain('"Constants" document');
    expect(text).not.toContain('"d"');
  });

  it('says there are none yet', () => {
    expect(projectConstantsOf({ documents: [] })).toEqual([]);
    expect(buildConstantsNote([])).toContain('The project has none yet.');
  });
});

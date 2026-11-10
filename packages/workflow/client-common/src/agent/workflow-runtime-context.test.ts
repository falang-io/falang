import { describe, expect, it } from 'vitest';
import {
  buildAiProviderNote,
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

describe('built-in AI provider note in the agent context (ADR 0081)', () => {
  const info = {
    chatModels: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'deepseek-chat', label: 'deepseek-chat' },
    ],
    imageModels: [{ id: 'gpt-image-1', label: 'gpt-image-1' }],
    transcribeModels: [],
  };

  it('adds nothing while the provider is not configured', () => {
    expect(buildAiProviderNote(null, ['openai'])).toBe('');
    expect(buildAiProviderNote(info, [])).toBe('');
    const text = new WorkflowRuntimeContextProvider(
      () => [],
      () => [],
      false,
      () => null,
    ).describe();
    expect(text).not.toContain('built-in AI provider');
    expect(
      createSandboxContextProvider(
        () => [],
        () => null,
      ).describe(),
    ).toBe('');
  });

  it('names the vendors and the models of every kind, says no key is needed, who pays and what is missing', () => {
    const text = new WorkflowRuntimeContextProvider(
      () => [],
      () => [],
      false,
      () => info,
    ).describe();
    expect(text).toContain('built-in AI provider for: openai.');
    expect(text).toContain('platformProvider: true');
    expect(text).toContain("paid from the project owner's balance");
    expect(text).toContain(
      'chat models (for call-ai-text and call-ai-choice): gpt-4o-mini (GPT-4o mini), deepseek-chat;',
    );
    expect(text).toContain('image models (for call-ai-image): gpt-image-1.');
    expect(text).toContain(
      "It offers no transcription models — the matching nodes need an instance with the user's own key.",
    );
    expect(text).toMatch(/Prefer it when the user wants AI but has not given an API key/);
    expect(
      createSandboxContextProvider(
        () => [],
        () => info,
      ).describe(),
    ).toContain('built-in AI provider');
  });
});

describe('built-in AI provider note with every kind offered (ADR 0081 phase 4)', () => {
  it('lists chat, image and transcription models and mentions no gap', () => {
    const text = buildAiProviderNote(
      {
        chatModels: [{ id: 'gpt-4o-mini', label: 'gpt-4o-mini' }],
        imageModels: [{ id: 'gpt-image-1', label: 'GPT Image' }],
        transcribeModels: [{ id: 'whisper-1', label: 'whisper-1' }],
      },
      ['openai'],
    );
    expect(text).toContain('transcription models (for call-ai-transcribe): whisper-1.');
    expect(text).toContain('image models (for call-ai-image): gpt-image-1 (GPT Image);');
    expect(text).not.toContain('offers no');
    expect(text).not.toContain('text and choice actions only');
  });
});

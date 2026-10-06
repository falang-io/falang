import { describe, expect, it } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { syncOptionsFromChildren } from './question-options.js';
import { WorkflowJsonFilesHost } from './workflow-json-files-host.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const question = (options: string[], labels: (string | { label: string; fixed: true })[]) => ({
  children: labels.map((label, index) => ({
    children: [],
    data: typeof label === 'string' ? { label } : label,
    id: `o${index}`,
    name: 'telegram-question-option',
  })),
  data: { chatId: 'message.chat.id', options, text: 'Ready?' },
  id: 'q',
  name: 'telegram-question',
});

describe('syncOptionsFromChildren (ADR 0062 (private))', () => {
  it("rebuilds a question's buttons from its branch labels, the fixed timeout branch excluded", () => {
    const node = question(['Yes', 'No'], ['Да', 'Нет', { fixed: true, label: 'Timeout' }]);
    syncOptionsFromChildren(node, REGISTERED_INTEGRATIONS);
    expect(node.data.options).toEqual(['Да', 'Нет']);
    expect(node.data.text).toBe('Ready?');
  });

  it("rebuilds a choice's options from its children's whole data", () => {
    const options = [
      { alias: 'yes', description: 'agrees' },
      { alias: 'no', description: 'refuses' },
    ];
    const node = {
      children: options.map((data, index) => ({ children: [], data, id: `c${index}`, name: 'call-ai-choice-option' })),
      data: { options: [{ alias: 'stale', description: '' }], prompt: 'x' },
      id: 'c',
      name: 'call-ai-choice',
    };
    syncOptionsFromChildren(node, REGISTERED_INTEGRATIONS);
    expect(node.data.options).toEqual(options);
  });

  it('leaves other kinds and children without usable data alone', () => {
    const action = { data: { options: ['a'] }, id: 'a', name: 'action' };
    syncOptionsFromChildren(action, REGISTERED_INTEGRATIONS);
    expect(action.data.options).toEqual(['a']);
    const broken = { ...question(['Yes'], []), children: [{ id: 'o', name: 'telegram-question-option' }] };
    syncOptionsFromChildren(broken, REGISTERED_INTEGRATIONS);
    expect(broken.data.options).toEqual(['Yes']);
  });

  it('is the workflow file host’s write-time normalisation', () => {
    const host = new WorkflowJsonFilesHost({
      nodeKindFilter: { isListed: () => true },
      store: { documents: [] } as unknown as IWorkflowAgentStore,
    });
    const node = question(['Yes', 'No'], ['Да', 'Нет']);
    host.dataMapping.normalize?.(node);
    expect(node.data.options).toEqual(['Да', 'Нет']);
  });
});

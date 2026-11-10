import { describe, expect, it } from 'vitest';
import type { IAgentNodeKindFilter } from '@falang/agent';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import type { WorkflowDocument } from '../workflow-types.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';
import { WorkflowJsonFilesHost } from './workflow-json-files-host.js';

describe('WorkflowJsonFilesHost integrations.json', () => {
  it('lists instances without fields, with devSandbox / platformProvider when set (ADR 0081)', () => {
    const documents = [
      {
        customData: {
          instances: [
            {
              fields: { apiKey: { dev: '', prod: '' }, baseUrl: '' },
              id: 'ai',
              name: 'AI',
              platformProvider: true,
              vendor: 'openai',
            },
            {
              fields: { botToken: { dev: 'secret', prod: '' } },
              id: 'tg',
              name: 'Bot',
              devSandbox: true,
              vendor: 'telegram',
            },
            {
              fields: { apiKey: { dev: 'k', prod: 'k' }, baseUrl: 'https://x' },
              id: 'own',
              name: 'Own',
              vendor: 'openai',
            },
          ],
        },
        folderId: null,
        id: 'integrations-doc',
        name: 'Integrations',
        pinned: true,
        type: INTEGRATIONS_DOCUMENT_TYPE,
      },
    ] as unknown as WorkflowDocument[];
    const store = { documents, folders: [] } as unknown as IWorkflowAgentStore;
    const host = new WorkflowJsonFilesHost({ nodeKindFilter: {} as IAgentNodeKindFilter, store });
    const text = host.extraFiles['integrations.json']?.() ?? '';
    expect(JSON.parse(text).instances).toEqual([
      { id: 'ai', name: 'AI', platformProvider: true, vendor: 'openai' },
      { devSandbox: true, id: 'tg', name: 'Bot', vendor: 'telegram' },
      { id: 'own', name: 'Own', vendor: 'openai' },
    ]);
    expect(text).not.toContain('secret');
  });
});

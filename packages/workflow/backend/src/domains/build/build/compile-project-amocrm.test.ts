import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildFunctionNode,
  buildLogNode,
  buildTriggerFunctionRootNode,
} from '../../../test-utils/workflow-e2e-fixtures.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check (several seconds cold); the package has no own vitest config.
vi.setConfig({ testTimeout: 45_000 });

const node = (id: string, name: string, data: Record<string, string>): INode => ({ id, name, data });

/**
 * Every amoCRM node kind in one function, compiled and type-checked against the real generated
 * activities.ts — catches a mismatch between an action's `emit()`, its `activitySignature` and its
 * `activityCode`, and checks that a create-lead node saved before its extra fields existed (only
 * `credentialId`/`name`/`price` in `data`) still builds.
 */
describe('compileProjectDocuments — amoCRM actions', () => {
  it('type-checks a function using every amoCRM node kind', () => {
    const document: IProjectDocument = {
      id: 'doc-amocrm',
      type: 'function',
      name: 'amocrmEverything',
      root: buildFunctionNode('doc-amocrm', [
        node('legacy-lead', 'amocrm-create-lead', { credentialId: 'cred-1', name: 'Legacy lead', price: '1000' }),
        node('lead', 'amocrm-create-lead', {
          credentialId: 'cred-1',
          name: 'Order',
          price: '1500',
          pipelineId: '7',
          statusId: 'undefined',
          responsibleUserId: 'undefined',
          extra: "{ custom_fields_values: [{ field_id: 1, values: [{ value: 'x' }] }] }",
          resultVariable: 'lead',
        }),
        node('update', 'amocrm-update-lead', { credentialId: 'cred-1', id: 'lead.id', statusId: '142' }),
        node('get', 'amocrm-get-lead', { credentialId: 'cred-1', id: 'lead.id', with: 'contacts', resultVariable: 'fetched' }),
        node('find', 'amocrm-find-leads', {
          credentialId: 'cred-1',
          query: 'Order',
          filter: '{ statuses: [{ pipeline_id: 7, status_id: 142 }] }',
          limit: '10',
          resultVariable: 'found',
        }),
        buildLogNode('log-found', '`found ${found.length}, fetched ${fetched?.name}`'),
        node('complex', 'amocrm-create-lead-complex', {
          credentialId: 'cred-1',
          name: 'Site request',
          contactName: 'Ivan',
          phone: '+79001234567',
          resultVariable: 'complex',
        }),
        node('contact', 'amocrm-create-contact', {
          credentialId: 'cred-1',
          name: 'Anna',
          email: 'a@b.c',
          resultVariable: 'contact',
        }),
        node('update-contact', 'amocrm-update-contact', { credentialId: 'cred-1', id: 'contact.id', phone: '+7900' }),
        node('find-contacts', 'amocrm-find-contacts', { credentialId: 'cred-1', query: '+7900', resultVariable: 'people' }),
        node('company', 'amocrm-create-company', { credentialId: 'cred-1', name: 'ACME', resultVariable: 'company' }),
        node('task', 'amocrm-create-task', {
          credentialId: 'cred-1',
          entityType: 'leads',
          entityId: 'complex.id',
          text: 'Call ${people.length} people',
          completeTill: 'Math.floor(Date.now() / 1000) + 3600',
          resultVariable: 'task',
        }),
        node('complete', 'amocrm-complete-task', { credentialId: 'cred-1', id: 'task.id', resultText: 'Done' }),
        node('note', 'amocrm-add-note', { credentialId: 'cred-1', entityType: 'contacts', entityId: 'contact.id', text: 'Hi' }),
        node('link', 'amocrm-link-entities', {
          credentialId: 'cred-1',
          entityType: 'leads',
          entityId: 'lead.id',
          toEntityType: 'companies',
          toEntityId: 'company.id',
        }),
        node('call', 'amocrm-call-method', {
          credentialId: 'cred-1',
          method: 'getLeads',
          data: '{ limit: 5 }',
          resultVariable: 'raw',
        }),
        buildLogNode('log-raw', '`raw ${raw?._page}`'),
      ]),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain(
      'await amocrmCreateLead("cred-1", `Legacy lead`, 1000, undefined, undefined, undefined, undefined);',
    );
    expect(result.workflows).toContain('const found = await amocrmFindLeads(');
    expect(result.workflows).toContain('const raw = await amocrmCallMethod("cred-1", "getLeads", { limit: 5 });');
    expect(result.activities).toContain('const amocrmRequest = async (');
    expect(result.activities).toContain('export const amocrmCallMethod = async (');
  });

  it('type-checks an amoCRM trigger function reacting to a lead stage change', () => {
    const document: IProjectDocument = {
      id: 'doc-amocrm-trigger',
      type: 'trigger-function',
      name: 'onLeadStatus',
      root: buildTriggerFunctionRootNode(
        'doc-amocrm-trigger',
        {
          vendor: 'amocrm',
          triggerName: 'amocrm-on-lead',
          credentialId: 'cred-1',
          scopeVariableName: 'event',
          scopeType: { type: 'struct', id: 'amocrm/WebhookEvent' },
        },
        [
          buildLogNode('log-status', '`lead ${event.id} moved ${event.oldStatusId} -> ${event.statusId}`'),
          node('note', 'amocrm-add-note', {
            credentialId: 'cred-1',
            entityType: 'leads',
            entityId: 'event.id ?? 0',
            text: 'Stage changed',
          }),
        ],
      ),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain("defineSignal<[any]>('amocrm-webhook')");
    expect(result.workflows).toContain('await amocrmAddNote(');
  });
});

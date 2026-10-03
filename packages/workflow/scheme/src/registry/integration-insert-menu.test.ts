import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { ContextMenuBuilder } from '@falang/scheme';
import { describe, expect, it, vi } from 'vitest';
import { getIntegrationMenuVendors } from './integration-insert-menu.js';

const vendor = (name: string, withCredentials: boolean, extra: Partial<IWorkflowIntegration> = {}) =>
  ({
    vendor: name,
    label: `${name}:label`,
    notes: 'x',
    credentialFields: withCredentials ? [{ name: 'token', label: 't', kind: 'secret' }] : [],
    triggers: [{ name: `${name}-trigger` }],
    actions: [{ name: `${name}-act` }],
    ...extra,
  }) as unknown as IWorkflowIntegration;

const instance = (vendorName: string): IIntegrationInstance => ({
  id: `${vendorName}-1`,
  vendor: vendorName,
  name: vendorName,
  fields: {},
});

describe('getIntegrationMenuVendors', () => {
  const all = [
    vendor('telegram', true, {
      questions: [{ name: 'telegram-question' }],
      choices: [{ name: 'tg-choice' }],
    } as unknown as Partial<IWorkflowIntegration>),
    vendor('openai', true),
    vendor('http', false),
  ];

  it('hides vendors without an instance but always keeps credential-less ones', () => {
    expect(getIntegrationMenuVendors(all, []).map((entry) => entry.vendor)).toEqual(['http']);
  });

  it('lists actions, questions and choices (never triggers) of vendors with an instance', () => {
    const result = getIntegrationMenuVendors(all, [instance('telegram')]);
    expect(result.map((entry) => entry.vendor)).toEqual(['telegram', 'http']);
    expect(result[0].nodeNames).toEqual(['telegram-act', 'telegram-question', 'tg-choice']);
  });

  it('reflects added instances on the next call', () => {
    const instances: IIntegrationInstance[] = [];
    expect(getIntegrationMenuVendors(all, instances)).toHaveLength(1);
    instances.push(instance('openai'));
    expect(getIntegrationMenuVendors(all, instances).map((entry) => entry.vendor)).toContain('openai');
  });
});

describe('ContextMenuBuilder groupPath', () => {
  it('nests groups verbatim even when segments contain a colon', () => {
    const builder = new ContextMenuBuilder({} as never);
    builder.addButtons({
      group: '',
      groupPath: ['Integrations', 'telegram:label'],
      items: [{ type: 'button', text: 'a', onClick: vi.fn() }],
    });
    builder.addButtons({
      group: '',
      groupPath: ['Integrations', 'telegram:label'],
      items: [{ type: 'button', text: 'b', onClick: vi.fn() }],
    });
    const menu = builder.getMenu();
    expect(menu).toHaveLength(1);
    const vendorGroup = (menu[0] as { children: { text: string; children: unknown[] }[] }).children[0];
    expect(vendorGroup.text).toBe('telegram:label');
    expect(vendorGroup.children).toHaveLength(2);
  });
});

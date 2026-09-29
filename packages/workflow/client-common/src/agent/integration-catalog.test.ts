import { describe, expect, it } from 'vitest';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import {
  createWorkflowNodeKindFilter,
  getVendorsInUse,
  normalizeKeywords,
  SEARCH_INTEGRATIONS_LIMIT,
  searchIntegrations,
} from './integration-catalog.js';

const instance = (vendor: string): IIntegrationInstance => ({ fields: {}, id: `${vendor}-1`, name: vendor, vendor });

interface IVendorResult {
  vendor: string;
  notes: string;
  triggers?: { name: string; notes: string; contextFields?: { name: string }[] }[];
  credentialFields?: { name: string }[];
}

const search = (keywords: unknown) =>
  searchIntegrations(REGISTERED_INTEGRATIONS, keywords) as { vendors: IVendorResult[]; note?: string };

describe('normalizeKeywords', () => {
  it('splits, lowercases and deduplicates a string or an array', () => {
    expect(normalizeKeywords('AI telegram, bot')).toEqual(['ai', 'telegram', 'bot']);
    expect(normalizeKeywords(['ai', 'Telegram bot', 'AI'])).toEqual(['ai', 'telegram', 'bot']);
    expect(normalizeKeywords(null)).toEqual([]);
  });
});

describe('searchIntegrations', () => {
  it('every registered vendor has non-empty notes', () => {
    for (const integration of REGISTERED_INTEGRATIONS) expect(integration.notes.length).toBeGreaterThan(0);
  });

  it('"ai telegram bot" finds Telegram and the LLM vendors, and none of the unrelated ones', () => {
    const vendors = search(['ai', 'telegram', 'bot', 'llm']).vendors.map((vendor) => vendor.vendor);
    expect(vendors).toEqual(expect.arrayContaining(['telegram', 'openai', 'gigachat', 'yandexgpt']));
    expect(vendors).not.toContain('moysklad');
    expect(vendors.length).toBeLessThanOrEqual(SEARCH_INTEGRATIONS_LIMIT);
  });

  it('ranks vendors matching more keywords first', () => {
    expect(search(['telegram', 'bot']).vendors[0]?.vendor).toBe('telegram');
  });

  it('describes triggers by notes/contextFields, never by label', () => {
    const telegram = search(['telegram']).vendors.find((vendor) => vendor.vendor === 'telegram');
    const onCommand = telegram?.triggers?.find((trigger) => trigger.name === 'telegram-on-command-trigger');
    expect(onCommand?.notes).toContain('one trigger-function document per command');
    expect(onCommand?.contextFields?.map((field) => field.name)).toEqual(['command']);
    for (const trigger of telegram?.triggers ?? []) expect(trigger).not.toHaveProperty('label');
  });

  it('never exposes hidden (OAuth-managed) credential fields', () => {
    const diadoc = search(['diadoc']).vendors.find((vendor) => vendor.vendor === 'diadoc');
    expect(diadoc?.credentialFields?.map((field) => field.name)).not.toContain('access_token');
  });

  it('with no keywords returns a compact vendor + notes index of every vendor', () => {
    const { vendors } = search(null);
    expect(vendors).toHaveLength(REGISTERED_INTEGRATIONS.length);
    expect(Object.keys(vendors[0] ?? {}).toSorted()).toEqual(['notes', 'vendor']);
  });

  it('explains what to try when nothing matches', () => {
    const result = search(['zzzz-no-such-thing']);
    expect(result.vendors).toEqual([]);
    expect(result.note).toContain('http-request');
  });
});

describe('createWorkflowNodeKindFilter', () => {
  it('lists a vendor node kind only once the project has an instance of that vendor', () => {
    let instances: IIntegrationInstance[] = [];
    const filter = createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () => instances);
    expect(filter.isListed('telegram-send-message')).toBe(false);
    expect(filter.isListed('moysklad-call-method')).toBe(false);
    instances = [instance('telegram')];
    expect(filter.isListed('telegram-send-message')).toBe(true);
    expect(filter.isListed('telegram-question')).toBe(true);
    expect(filter.isListed('moysklad-call-method')).toBe(false);
  });

  it('always lists core kinds and kinds of credential-less vendors; never lists trigger kinds', () => {
    const filter = createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () => [instance('telegram')]);
    expect(filter.isListed('action')).toBe(true);
    expect(filter.isListed('http-request')).toBe(true);
    expect(filter.isListed('telegram-trigger')).toBe(false);
    expect(filter.hiddenNote).toContain('create_integration_instance');
  });

  it('lists activepieces-action only once some ActivePieces piece has an instance', () => {
    let instances: IIntegrationInstance[] = [];
    const filter = createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () => instances);
    expect(filter.isListed('activepieces-action')).toBe(false);
    instances = [instance('activepieces-slack')];
    expect(filter.isListed('activepieces-action')).toBe(true);
  });
});

describe('getVendorsInUse', () => {
  it('is every instantiated vendor plus every vendor with no credential fields', () => {
    const integrations = [
      { credentialFields: [], vendor: 'free' },
      { credentialFields: [{ kind: 'secret', label: 'Key', name: 'key' }], vendor: 'paid' },
      { credentialFields: [{ kind: 'secret', label: 'Key', name: 'key' }], vendor: 'other' },
    ] as unknown as IWorkflowIntegration[];
    expect([...getVendorsInUse(integrations, [instance('paid')])].toSorted()).toEqual(['free', 'paid']);
  });
});

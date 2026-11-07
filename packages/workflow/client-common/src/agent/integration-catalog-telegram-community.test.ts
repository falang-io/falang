import { describe, expect, it } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { searchIntegrations } from './integration-catalog.js';

interface ISearchResult {
  vendors: { vendor: string; triggers?: { name: string; contextFields?: { name: string }[] }[] }[];
}

const search = (keywords: string[]): ISearchResult =>
  searchIntegrations(REGISTERED_INTEGRATIONS, keywords) as unknown as ISearchResult;

describe('searchIntegrations — Telegram community management (ADR 0076 (private))', () => {
  it.each(['moderation', 'ban', 'kick', 'community', 'join request'])('"%s" finds Telegram', (keyword) => {
    expect(search([keyword]).vendors.map((vendor) => vendor.vendor)).toContain('telegram');
  });

  it('lists the member triggers and the routing context fields of the on-message trigger', () => {
    const telegram = search(['telegram']).vendors.find((vendor) => vendor.vendor === 'telegram');
    const names = telegram?.triggers?.map((trigger) => trigger.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining(['telegram-member-joined', 'telegram-member-left', 'telegram-join-request']),
    );
    const onMessage = telegram?.triggers?.find((trigger) => trigger.name === 'telegram-trigger');
    expect(onMessage?.contextFields?.map((field) => field.name)).toEqual(['chatType', 'conversation']);
  });
});

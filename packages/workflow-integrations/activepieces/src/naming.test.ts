import { describe, expect, it } from 'vitest';
import { activepiecesTriggerNameFor, activepiecesVendorFor } from './naming.js';

describe('activepiecesVendorFor', () => {
  it('prefixes the piece name with "activepieces-"', () => {
    expect(activepiecesVendorFor('wordpress')).toBe('activepieces-wordpress');
    expect(activepiecesVendorFor('mock')).toBe('activepieces-mock');
  });
});

describe('activepiecesTriggerNameFor', () => {
  it('qualifies a piece-local trigger name with the piece name, so it is globally unique across vendors', () => {
    expect(activepiecesTriggerNameFor('wordpress', 'new_post')).toBe('wordpress-new_post');
    expect(activepiecesTriggerNameFor('mock', 'new_item')).toBe('mock-new_item');
  });
});

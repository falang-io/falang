import { describe, expect, it } from 'vitest';
import { nameForPickedVendor } from './integrations-editor-form.js';

describe('nameForPickedVendor', () => {
  it('fills an empty name with the vendor name', () => {
    expect(nameForPickedVendor('', null, 'amoCRM')).toBe('amoCRM');
    expect(nameForPickedVendor('  ', null, 'amoCRM')).toBe('amoCRM');
  });

  it('follows the vendor while the name is still the automatic one', () => {
    expect(nameForPickedVendor('Telegram', 'Telegram', 'amoCRM')).toBe('amoCRM');
  });

  it('keeps a name the user typed', () => {
    expect(nameForPickedVendor('Sales bot', 'Telegram', 'amoCRM')).toBe('Sales bot');
    expect(nameForPickedVendor('Sales bot', null, 'amoCRM')).toBe('Sales bot');
  });
});

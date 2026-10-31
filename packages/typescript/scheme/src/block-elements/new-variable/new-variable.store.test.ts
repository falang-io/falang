import { describe, expect, it } from 'vitest';
import { NewVariableStore } from './new-variable.store.js';

describe('NewVariableStore', () => {
  it('reports an empty name as an error by default', () => {
    const store = new NewVariableStore({ value: '', getScopeNames: () => [] });
    expect(store.hasErrors).toBe(true);
  });

  it('accepts an empty name when allowEmpty is set, but still validates a typed one', () => {
    const store = new NewVariableStore({ value: '', getScopeNames: () => ['taken'], allowEmpty: true });
    expect(store.error).toBeNull();
    store.setValue('taken');
    expect(store.hasErrors).toBe(true);
    store.setValue('lead');
    expect(store.hasErrors).toBe(false);
  });
});

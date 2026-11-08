import { MAX_MESSAGE_BUTTONS } from '@falang/workflow-integrations-common';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeMonaco } from '../../test-utils/fake-monaco.js';
import { ButtonsFieldStore } from './buttons-field.store.js';

const make = (value: string): ButtonsFieldStore =>
  new ButtonsFieldStore({ id: 'node-1', name: 'buttons', value, getScopeCode: () => '' });

const parsed = (store: ButtonsFieldStore): unknown => JSON.parse(store.value);

describe('ButtonsFieldStore', () => {
  beforeEach(() => installFakeMonaco());

  it('reads the stored list and writes it back unchanged', () => {
    const value = JSON.stringify([
      { kind: 'url', text: 'Site', value: 'https://x' },
      { kind: 'command', text: 'Help', value: '/help' },
    ]);
    const store = make(value);
    expect(store.rows.map((row) => row.kind)).toEqual(['url', 'command']);
    expect(store.value).toBe(value);
    store.dispose();
  });

  it('adds, re-kinds, moves and removes rows', () => {
    const store = make('[]');
    store.addRow();
    store.addRow('command');
    const [first, second] = store.rows;
    store.setKind(first.key, 'command');
    store.moveRow(second.key, -1);
    expect(store.rows.map((row) => row.key)).toEqual([second.key, first.key]);
    expect(parsed(store)).toEqual([
      { kind: 'command', text: '', value: '' },
      { kind: 'command', text: '', value: '' },
    ]);
    store.moveRow(second.key, -1);
    expect(store.rows[0].key).toBe(second.key);
    store.removeRow(second.key);
    expect(store.rows.map((row) => row.key)).toEqual([first.key]);
    store.dispose();
  });

  it('stops adding at the limit', () => {
    const store = make('');
    for (let i = 0; i < MAX_MESSAGE_BUTTONS + 3; i += 1) store.addRow();
    expect(store.rows).toHaveLength(MAX_MESSAGE_BUTTONS);
    expect(store.canAdd).toBe(false);
    store.dispose();
  });

  it('keeps an unreadable stored value until the list is edited', () => {
    const store = make('{oops');
    expect(store.parseError).toContain('not valid JSON');
    expect(store.value).toBe('{oops');
    store.addRow();
    expect(store.parseError).toBeNull();
    expect(parsed(store)).toEqual([{ kind: 'url', text: '', value: '' }]);
    store.dispose();
  });
});

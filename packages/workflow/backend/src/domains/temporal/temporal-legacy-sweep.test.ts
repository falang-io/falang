// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import type { Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { pauseLegacyNamespaceSchedules } from './temporal-legacy-sweep.js';

describe('pauseLegacyNamespaceSchedules', () => {
  it('pauses only unpaused schedules created by Falang (memo falangProjectId), leaving foreign and paused ones alone', async () => {
    const handles = new Map<string, { pause: ReturnType<typeof vi.fn> }>();
    const handle = (id: string) => {
      const existing = handles.get(id) ?? { pause: vi.fn().mockResolvedValue(undefined) };
      handles.set(id, existing);
      return existing;
    };
    const client = {
      schedule: {
        list: async function* list() {
          yield { scheduleId: 'ours-running', memo: { falangProjectId: 'p1' }, state: { paused: false } };
          yield { scheduleId: 'ours-paused', memo: { falangProjectId: 'p2' }, state: { paused: true } };
          yield { scheduleId: 'foreign', memo: { owner: 'someone' }, state: { paused: false } };
          yield { scheduleId: 'no-memo', state: { paused: false } };
        },
        getHandle: vi.fn((id: string) => handle(id)),
      },
    } as unknown as Client;

    const paused = await pauseLegacyNamespaceSchedules(client, 'moved');

    expect(paused).toEqual(['ours-running']);
    expect(handles.get('ours-running')?.pause).toHaveBeenCalledWith('moved');
    expect(handles.has('ours-paused')).toBe(false);
    expect(handles.has('foreign')).toBe(false);
  });
});

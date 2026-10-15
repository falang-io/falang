import { describe, expect, it } from 'vitest';
import { buildActionContext, buildPropertyContext, buildTriggerContext, createTriggerStore } from './context.js';

describe('createTriggerStore', () => {
  it('reads, writes and deletes through the backing map, returning null for a missing key', async () => {
    const state = new Map<string, unknown>();
    const store = createTriggerStore(state);
    expect(await store.get('k')).toBeNull();
    expect(await store.put('k', 1)).toBe(1);
    expect(state.get('k')).toBe(1);
    expect(await store.get('k')).toBe(1);
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });
});

describe('contexts', () => {
  it('buildActionContext carries props and auth and stubs the rest, throwing for unsupported features', async () => {
    const ctx = buildActionContext({ a: 1 }, { token: 't' }) as unknown as Record<string, any>;
    expect(ctx.propsValue).toEqual({ a: 1 });
    expect(ctx.auth).toEqual({ token: 't' });
    expect(await ctx.store.get('x')).toBeNull();
    expect(await ctx.store.put('x', 2)).toBe(2);
    await expect(ctx.store.delete('x')).resolves.toBeUndefined();
    expect(await ctx.project.externalId()).toBeUndefined();
    expect(await ctx.connections.get()).toBeNull();
    await expect(ctx.tags.add()).resolves.toBeUndefined();
    await expect(ctx.output.update()).resolves.toBeUndefined();
    expect(() => ctx.run.stop()).not.toThrow();
    expect(() => ctx.run.respond()).not.toThrow();
    expect(() => ctx.files.write()).toThrow(/files.write is not supported/);
    expect(() => ctx.flows.list()).toThrow(/flows.list is not supported/);
    expect(() => ctx.agent.tools()).toThrow(/agent.tools/);
    expect(() => ctx.run.createWaitpoint()).toThrow(/createWaitpoint/);
    expect(() => ctx.run.waitForWaitpoint()).toThrow(/waitForWaitpoint/);
  });

  it('buildTriggerContext exposes the given store and stubs the rest', async () => {
    const store = createTriggerStore(new Map());
    const ctx = buildTriggerContext({ p: 1 }, 'auth', store) as Record<string, any>;
    expect(ctx.store).toBe(store);
    expect(ctx.propsValue).toEqual({ p: 1 });
    expect(await ctx.project.externalId()).toBeUndefined();
    expect(await ctx.connections.get()).toBeNull();
    expect(() => ctx.setSchedule()).not.toThrow();
    expect(() => ctx.flows.list()).toThrow();
    expect(() => ctx.files.write()).toThrow();
  });

  it('buildPropertyContext carries the search value', async () => {
    const ctx = buildPropertyContext('abc') as unknown as Record<string, any>;
    expect(ctx.searchValue).toBe('abc');
    expect(await ctx.project.externalId()).toBeUndefined();
    expect(await ctx.connections.get()).toBeNull();
    expect(() => ctx.flows.list()).toThrow();
  });
});

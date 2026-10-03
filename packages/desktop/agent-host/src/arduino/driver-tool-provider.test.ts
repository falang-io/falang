import { describe, expect, it, vi } from 'vitest';
import { DriverToolProvider, type IDriverToolEntry, type IDriverToolHost } from './driver-tool-provider.js';

const config = {
  actions: [
    {
      codeTemplate: 'x_blink(${pin})',
      fields: [{ default: '13', kind: 'pin' as const, label: 'Pin', name: 'pin' }],
      id: 'blink',
      label: 'Blink',
      notes: 'Blinks.',
    },
  ],
  declarations: ['declare function x_blink(pin: number): void;'],
  id: 'x',
  includes: ['x.h'],
  label: 'X',
  notes: 'An X.',
  sourceFiles: ['x.h', 'x.cpp'],
};
const entry: IDriverToolEntry = { config, scope: 'project', status: 'ok' };
const bundle = { config, files: { 'x.cpp': '', 'x.h': '' }, formatVersion: 1 as const };

const makeHost = (overrides: Partial<IDriverToolHost> = {}): IDriverToolHost => ({
  getDriver: vi.fn().mockResolvedValue(bundle),
  listDrivers: vi.fn().mockResolvedValue([entry]),
  setProjectDriver: vi.fn().mockResolvedValue({ errors: [], ok: true, warnings: [] }),
  validateDriver: vi.fn().mockResolvedValue({ errors: [], ok: true, warnings: [] }),
  ...overrides,
});
const call = (name: string, input: unknown) => ({ id: '1', input, name });

describe('DriverToolProvider', () => {
  it('offers exactly the four tools, with the bundle JSON Schema as validate/set input', () => {
    const provider = new DriverToolProvider(makeHost());
    expect(provider.tools.map((tool) => tool.name)).toEqual([
      'list_drivers',
      'get_driver',
      'validate_driver',
      'set_driver',
    ]);
    const validate = provider.tools.find((tool) => tool.name === 'validate_driver');
    const schema = validate?.inputSchema as {
      required: string[];
      properties: { bundle: { properties: Record<string, unknown> } };
    };
    expect(schema.required).toEqual(['bundle']);
    expect(Object.keys(schema.properties.bundle.properties)).toEqual(['formatVersion', 'config', 'files']);
    expect(JSON.stringify(provider.tools)).not.toContain('"$schema"');
  });

  it('list_drivers summarizes actions, notes, fields and status', async () => {
    const result = await new DriverToolProvider(makeHost()).execute(call('list_drivers', {}));
    expect(result.ok).toBe(true);
    const [item] = JSON.parse((result as { content: string }).content) as Record<string, unknown>[];
    expect(item).toMatchObject({ id: 'x', notes: 'An X.', scope: 'project', status: 'ok' });
    expect(item.actions).toEqual([
      { fields: [{ kind: 'pin', name: 'pin' }], id: 'blink', label: 'Blink', notes: 'Blinks.' },
    ]);
  });

  it('get_driver returns the bundle and reports an unknown id as an error result', async () => {
    const host = makeHost({ getDriver: vi.fn().mockRejectedValue(new Error('no such driver')) });
    const provider = new DriverToolProvider(host);
    expect(await provider.execute(call('get_driver', {}))).toMatchObject({ ok: false });
    expect(await provider.execute(call('get_driver', { id: 'nope' }))).toEqual({
      error: 'get_driver: no such driver',
      ok: false,
    });
    const good = await new DriverToolProvider(makeHost()).execute(call('get_driver', { id: 'x' }));
    expect(JSON.parse((good as { content: string }).content)).toEqual(bundle);
  });

  it('validate_driver passes the untrusted bundle to the host and surfaces failures', async () => {
    const failing = { errors: [{ message: 'bad', stage: 'schema' }], ok: false, warnings: [] };
    const host = makeHost({ validateDriver: vi.fn().mockResolvedValue(failing) });
    const result = await new DriverToolProvider(host).execute(call('validate_driver', { bundle: { junk: 1 } }));
    expect(host.validateDriver).toHaveBeenCalledWith({ junk: 1 });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain('"message":"bad"');
  });

  it('set_driver writes through the host; a failed validation passes its errors through', async () => {
    const host = makeHost();
    const ok = await new DriverToolProvider(host).execute(call('set_driver', { bundle }));
    expect(host.setProjectDriver).toHaveBeenCalledWith(bundle);
    expect(ok).toMatchObject({ ok: true });
    expect(JSON.parse((ok as { content: string }).content)).toMatchObject({ ok: true, written: true });

    const failing = { errors: [{ message: 'collides', stage: 'collisions' }], ok: false, warnings: [] };
    const bad = await new DriverToolProvider(
      makeHost({ setProjectDriver: vi.fn().mockResolvedValue(failing) }),
    ).execute(call('set_driver', { bundle }));
    expect(bad).toMatchObject({ ok: false });
    expect((bad as { error: string }).error).toContain('collides');
    expect(await new DriverToolProvider(host).execute(call('set_driver', {}))).toMatchObject({ ok: false });
  });
});

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { BUNDLED_DRIVERS_DIR } from '@falang/desktop-arduino-drivers';
import { readDriverBundle, type IDriverBundle, type IDriverConfig } from '@falang/desktop-arduino-dto';
import { describe, expect, it } from 'vitest';
import { findDriverUsages } from './driver-usages.js';
import { validateDriverBundle } from './validate-driver-bundle.js';

const bundle = (): IDriverBundle => ({
  formatVersion: 1,
  config: {
    id: 'tiny-sensor',
    label: 'Tiny sensor',
    includes: ['tiny.h'],
    sourceFiles: ['tiny.h', 'tiny.cpp'],
    declarations: [
      'declare function tiny_read(pin: number): number;',
      'declare function tiny_init(addr: number): void;',
    ],
    actions: [
      {
        id: 'read',
        label: 'Read',
        fields: [
          { name: 'pin', label: 'Pin', kind: 'pin', default: '2' },
          { name: 'out', label: 'Result', kind: 'new-variable', default: 'val' },
        ],
        codeTemplate: 'tiny_read(${pin})',
        resultType: 'float',
      },
    ],
    device: {
      fields: [{ name: 'addr', label: 'Address', kind: 'select', options: [{ value: '39', label: '0x27' }] }],
      setupTemplate: 'tiny_init(${addr})',
    },
  },
  files: { 'tiny.h': '// h', 'tiny.cpp': '// c' },
});

const withConfig = (patch: (config: IDriverConfig) => IDriverConfig): IDriverBundle => {
  const base = bundle();
  return { ...base, config: patch(base.config) };
};

const actionNodeDoc = (name: string, data: Record<string, string>, id = 'doc-1', nodeId = 'n1'): IProjectDocument => ({
  id,
  type: 'function',
  name: 'setup',
  root: {
    id: 'r',
    name: 'function',
    children: [{ id: 'b', name: 'function-body', children: [{ id: nodeId, name, data }] }],
  },
});

describe('validateDriverBundle', () => {
  it('accepts a valid bundle (templates + device) and an existing bundled driver as positive control', async () => {
    expect(await validateDriverBundle(bundle(), { otherDrivers: [] })).toMatchObject({ ok: true, errors: [] });
    const hcsr04 = await readDriverBundle(path.join(BUNDLED_DRIVERS_DIR, 'hc-sr04'));
    expect(await validateDriverBundle(hcsr04, { otherDrivers: [] })).toMatchObject({ ok: true });
  });

  it('every bundled driver validates', async () => {
    const dirs = await fs.readdir(BUNDLED_DRIVERS_DIR);
    for (const dir of dirs) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await validateDriverBundle(await readDriverBundle(path.join(BUNDLED_DRIVERS_DIR, dir)), {
        otherDrivers: [],
      });
      expect(result.errors, dir).toEqual([]);
    }
  });

  it('stage 1: reports schema/bundle errors', async () => {
    const result = await validateDriverBundle({ ...bundle(), files: {} }, { otherDrivers: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.every((e) => e.stage === 'schema')).toBe(true);
  });

  it('stage 2: errors on a declaration colliding with another driver or an Arduino built-in; warns on overriding a bundled id', async () => {
    const other: IDriverConfig = {
      ...bundle().config,
      id: 'other',
      declarations: ['declare function tiny_read(pin: number): number;'],
    };
    const clash = await validateDriverBundle(bundle(), { otherDrivers: [other] });
    expect(clash.errors[0]).toMatchObject({ stage: 'collisions' });
    expect(clash.errors[0].message).toContain('driver "other"');

    const builtin = withConfig((c) => ({
      ...c,
      declarations: [...c.declarations, 'declare function digitalWrite(p: number): void;'],
    }));
    const builtinResult = await validateDriverBundle(builtin, { otherDrivers: [] });
    expect(builtinResult.errors[0].message).toContain('Arduino built-ins');

    const same = await validateDriverBundle(bundle(), { otherDrivers: [{ ...bundle().config, scope: 'bundled' }] });
    expect(same.ok).toBe(true);
    expect(same.warnings[0].message).toContain('overrides the built-in');
  });

  it('stage 3: a typo in a function name names the action', async () => {
    const typo = withConfig((c) => ({ ...c, actions: [{ ...c.actions[0], codeTemplate: 'tiny_raed(${pin})' }] }));
    const result = await validateDriverBundle(typo, { otherDrivers: [] });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ stage: 'templates', action: 'read' });
  });

  it('stage 3: a wrong argument count names the action', async () => {
    const bad = withConfig((c) => ({ ...c, actions: [{ ...c.actions[0], codeTemplate: 'tiny_read(${pin}, 1)' }] }));
    const result = await validateDriverBundle(bad, { otherDrivers: [] });
    expect(result.errors[0]).toMatchObject({ stage: 'templates', action: 'read' });
  });

  it('stage 3: an incompatible resultType is an error', async () => {
    const bad = withConfig((c) => ({
      ...c,
      declarations: [...c.declarations, 'declare function tiny_name(pin: number): string;'],
      actions: [{ ...c.actions[0], codeTemplate: 'tiny_name(${pin})', resultType: 'float' }],
    }));
    const result = await validateDriverBundle(bad, { otherDrivers: [] });
    expect(result.errors[0]).toMatchObject({ stage: 'templates', action: 'read' });
  });

  it('stage 3: a broken device setupTemplate is reported as "device"', async () => {
    const bad = withConfig((c) => ({
      ...c,
      device: { ...(c.device as NonNullable<IDriverConfig['device']>), setupTemplate: 'tiny_init(${addr}, 5)' },
    }));
    const result = await validateDriverBundle(bad, { otherDrivers: [] });
    expect(result.errors[0]).toMatchObject({ stage: 'templates', action: 'device' });
  });

  it('stage 4: runs the optional CLI hook; errors fail, warnings accumulate; absent hook is skipped', async () => {
    let seen: Record<string, string> = {};
    const ok = await validateDriverBundle(bundle(), {
      otherDrivers: [],
      runCliCheck: (files) => {
        seen = { ...files };
        return Promise.resolve({ warnings: ['arduino-cli not found'] });
      },
    });
    expect(ok.ok).toBe(true);
    expect(ok.warnings[0]).toMatchObject({ stage: 'cli' });
    expect(Object.keys(seen).toSorted()).toEqual(['sketch.ino', 'tiny.cpp', 'tiny.h']);
    expect(seen['sketch.ino']).toContain('tiny_read(');
    expect(seen['sketch.ino']).toContain('tiny_init(39)');

    const failed = await validateDriverBundle(bundle(), {
      otherDrivers: [],
      runCliCheck: () => Promise.resolve({ errors: ['boom'] }),
    });
    expect(failed.errors[0]).toMatchObject({ stage: 'cli', message: 'boom' });
  });

  it('stage 5: removed action, missing select option and removed device section are reported with ids', async () => {
    const project = {
      documents: [
        actionNodeDoc('driver-action::tiny-sensor::gone', {}, 'doc-a', 'node-a'),
        actionNodeDoc('driver-action::tiny-sensor::read', { pin: '3', out: 'v' }, 'doc-b', 'node-b'),
        { id: 'doc-dev', type: 'devices', name: 'Devices', data: null } as IProjectDocument,
      ],
      devicesData: {
        pins: [],
        devices: [{ id: 'i1', driverId: 'tiny-sensor', name: 'Front', params: { addr: '99' } }],
      },
    };
    const result = await validateDriverBundle(bundle(), { otherDrivers: [], project });
    expect(result.ok).toBe(false);
    expect(result.errors.every((e) => e.stage === 'usages')).toBe(true);
    expect(result.errors).toContainEqual(expect.objectContaining({ documentId: 'doc-a', nodeId: 'node-a' }));
    expect(result.errors.some((e) => e.documentId === 'doc-dev' && e.message.includes('not one of the options'))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.documentId === 'doc-b')).toBe(false);

    const noDevice = withConfig((c) => ({
      id: c.id,
      label: c.label,
      includes: c.includes,
      sourceFiles: c.sourceFiles,
      declarations: c.declarations,
      actions: c.actions,
    }));
    const result2 = await validateDriverBundle(noDevice, {
      otherDrivers: [],
      project: { ...project, documents: [project.documents[2]] },
    });
    expect(result2.errors[0].message).toContain('no "device" section');
  });

  it('stage 5: unrelated drivers and valid usages pass', async () => {
    const project = {
      documents: [
        actionNodeDoc('driver-action::tiny-sensor::read', { pin: '3', out: 'v' }),
        actionNodeDoc('driver-action::dht::read-humidity', {}, 'd2', 'n2'),
      ],
    };
    expect(await validateDriverBundle(bundle(), { otherDrivers: [], project })).toMatchObject({ ok: true });
  });

  it('findDriverUsages lists nodes and device instances of one driver only', () => {
    const usages = findDriverUsages('tiny-sensor', {
      documents: [
        actionNodeDoc('driver-action::tiny-sensor::read', {}),
        actionNodeDoc('driver-action::dht::read-humidity', {}, 'd2', 'n2'),
      ],
      devicesData: { pins: [], devices: [{ id: 'i1', driverId: 'tiny-sensor', name: 'x', params: {} }] },
    });
    expect(usages).toEqual([
      { kind: 'node', documentId: 'doc-1', nodeId: 'n1', actionId: 'read' },
      { kind: 'device', documentId: '', instanceId: 'i1' },
    ]);
  });
});

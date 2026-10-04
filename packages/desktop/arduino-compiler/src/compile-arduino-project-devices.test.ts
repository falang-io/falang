import { describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto';
import { compileArduinoProject } from './compile-arduino-project.js';

// Split out of `compile-arduino-project.test.ts` (ADR 0032 (private)'s Devices-document setup
// prologue) to keep that file under oxlint's `max-lines` (300) rather than disabling it — these
// helpers are the same tiny fixtures that file defines, duplicated rather than shared/exported since
// they're only ever used inline by a handful of `it`s in each file.
interface IFunctionNodeParams {
  readonly id: string;
  readonly body: INode[];
}

const functionNode = ({ id, body }: IFunctionNodeParams): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

/** A fixed fixture, not a per-test factory — every test below builds a fresh compile from it, and `compileArduinoProject` never mutates its input `documents`. */
const devicesDocumentFixture: IProjectDocument = {
  id: 'doc-devices',
  type: 'devices',
  name: 'Devices',
  data: {
    pins: [{ id: 'p1', pin: 13, mode: 'output' }],
    devices: [{ id: 'd1', driverId: 'lcd1602-i2c', name: 'Front display', params: { address: '39' } }],
  },
};

// Real ts.Program type-check / app boot (real type-check); the package has no own vitest config, so the default 5s/10s would flake under a full parallel run.
vi.setConfig({ testTimeout: 20_000 });

describe('compileArduinoProject — Devices document setup prologue (ADR 0032 (private))', () => {
  const lcdDriver: IDriverConfig = {
    id: 'lcd1602-i2c',
    label: 'LCD1602 (I2C)',
    includes: ['lcd1602-i2c-driver.h'],
    sourceFiles: ['lcd1602-i2c-driver.h', 'lcd1602-i2c-driver.cpp'],
    declarations: ['declare function lcd_init(address: number): void;'],
    actions: [
      {
        id: 'clear',
        label: 'Clear display',
        fields: [{ name: 'address', label: 'I2C address', kind: 'select', options: [{ value: '39', label: '0x27' }] }],
        codeTemplate: 'lcd_clear(${address})',
      },
    ],
    device: {
      fields: [{ name: 'address', label: 'I2C address', kind: 'select', options: [{ value: '39', label: '0x27' }] }],
      setupTemplate: 'lcd_init(${address})',
    },
  };

  it('splices pinMode + the driver device.setupTemplate into setup(), and marks the driver used with no driver-action node', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });

    const { code, usedDriverIds } = compileArduinoProject({
      documents: [
        functionDocument('doc-setup', 'setup', setup),
        functionDocument('doc-loop', 'loop', loop),
        devicesDocumentFixture,
      ],
      drivers: [lcdDriver],
    });

    expect(code).toContain('void setup() {\n  pinMode(13, OUTPUT);\n  lcd_init(39);\n');
    expect(code).toContain('#include "lcd1602-i2c-driver.h"');
    expect(usedDriverIds).toEqual(new Set(['lcd1602-i2c']));
  });

  it('orders debug-attach lines before the prologue lines in a debug build', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });

    const { code } = compileArduinoProject({
      documents: [
        functionDocument('doc-setup', 'setup', setup),
        functionDocument('doc-loop', 'loop', loop),
        devicesDocumentFixture,
      ],
      drivers: [lcdDriver],
      debug: true,
    });

    expect(code).toContain(
      'void setup() {\n  Serial.begin(115200);\n  falang_wait_attach();\n  pinMode(13, OUTPUT);\n  lcd_init(39);\n',
    );
  });

  it('throws naming the Devices document on invalid data', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });
    const badDevices: IProjectDocument = {
      id: 'doc-devices',
      type: 'devices',
      name: 'Devices',
      data: { pins: [{ id: 'p', pin: -1, mode: 'output' }], devices: [] },
    };

    expect(() =>
      compileArduinoProject({
        documents: [
          functionDocument('doc-setup', 'setup', setup),
          functionDocument('doc-loop', 'loop', loop),
          badDevices,
        ],
        drivers: [lcdDriver],
      }),
    ).toThrow(/Devices document "Devices" is invalid/);
  });

  it('throws naming the Devices document on an unknown driverId', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });
    const badDevices: IProjectDocument = {
      id: 'doc-devices',
      type: 'devices',
      name: 'Devices',
      data: { pins: [], devices: [{ id: 'd1', driverId: 'no-such-driver', name: 'Mystery', params: {} }] },
    };

    expect(() =>
      compileArduinoProject({
        documents: [
          functionDocument('doc-setup', 'setup', setup),
          functionDocument('doc-loop', 'loop', loop),
          badDevices,
        ],
        drivers: [lcdDriver],
      }),
    ).toThrow(/Devices document "Devices"/);
  });

  it('no Devices document in the project leaves setup() exactly as before (backward compatible)', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });

    const { code } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
    });

    expect(code).toContain('void setup() {\n\n}');
  });
});

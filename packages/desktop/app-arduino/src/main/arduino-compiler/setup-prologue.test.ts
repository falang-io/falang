import { describe, expect, it } from 'vitest';
import type { IProjectDocument } from '@falang/dto';
import type { IDevicesDocumentData } from '../../shared/devices-document.js';
import type { IDriverConfig } from '../../shared/driver-config.js';
import { buildSetupPrologue } from './setup-prologue.js';

const devicesDocument = (data: IDevicesDocumentData, name = 'Devices'): IProjectDocument => ({
  id: 'doc-devices',
  type: 'devices',
  name,
  data,
});

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

/** An action-only driver — no `device` section — to exercise the "driver has no device section" error path. */
const dhtDriver: IDriverConfig = {
  id: 'dht',
  label: 'DHT',
  includes: ['dht-driver.h'],
  sourceFiles: ['dht-driver.h', 'dht-driver.cpp'],
  declarations: [],
  actions: [{ id: 'read-temperature', label: 'Read temperature', fields: [], codeTemplate: 'dht_read_temperature()' }],
};

describe('buildSetupPrologue', () => {
  it('returns no lines/no used drivers when there is no Devices document', () => {
    const result = buildSetupPrologue({ drivers: [lcdDriver] });
    expect(result).toEqual({ lines: [], usedDriverIds: new Set() });
  });

  it('returns no lines when the Devices document is empty', () => {
    const result = buildSetupPrologue({
      devicesDocument: devicesDocument({ pins: [], devices: [] }),
      drivers: [lcdDriver],
    });
    expect(result).toEqual({ lines: [], usedDriverIds: new Set() });
  });

  it('emits one pinMode per pin, in document order, mapping mode to the right C++ identifier', () => {
    const result = buildSetupPrologue({
      devicesDocument: devicesDocument({
        pins: [
          { id: 'p1', pin: 13, mode: 'output' },
          { id: 'p2', pin: 2, mode: 'input' },
          { id: 'p3', pin: 3, mode: 'input-pullup' },
        ],
        devices: [],
      }),
      drivers: [],
    });
    expect(result.lines).toEqual(['pinMode(13, OUTPUT);', 'pinMode(2, INPUT);', 'pinMode(3, INPUT_PULLUP);']);
  });

  it('emits one substituted setupTemplate call per device instance, and marks its driver used even with no driver-action node', () => {
    const result = buildSetupPrologue({
      devicesDocument: devicesDocument({
        pins: [{ id: 'p1', pin: 13, mode: 'output' }],
        devices: [{ id: 'd1', driverId: 'lcd1602-i2c', name: 'Front display', params: { address: '39' } }],
      }),
      drivers: [lcdDriver],
    });
    expect(result.lines).toEqual(['pinMode(13, OUTPUT);', 'lcd_init(39);']);
    expect(result.usedDriverIds).toEqual(new Set(['lcd1602-i2c']));
  });

  it('throws naming the Devices document on structurally invalid data', () => {
    expect(() =>
      buildSetupPrologue({
        devicesDocument: devicesDocument({ pins: [{ id: 'p', pin: -1, mode: 'output' }], devices: [] }),
        drivers: [],
      }),
    ).toThrow(/Devices document "Devices" is invalid/);
  });

  it('treats a missing data payload (no `data` key at all) as empty rather than throwing', () => {
    const result = buildSetupPrologue({
      devicesDocument: { id: 'doc-devices', type: 'devices', name: 'Devices' },
      drivers: [],
    });
    expect(result).toEqual({ lines: [], usedDriverIds: new Set() });
  });

  it('throws naming the Devices document and the instance for an unknown driverId', () => {
    expect(() =>
      buildSetupPrologue({
        devicesDocument: devicesDocument({
          pins: [],
          devices: [{ id: 'd1', driverId: 'no-such-driver', name: 'Mystery device', params: {} }],
        }),
        drivers: [lcdDriver],
      }),
    ).toThrow(/Devices document "Devices": device "Mystery device" references unknown driver "no-such-driver"/);
  });

  it('throws naming the Devices document and the instance for a driver with no "device" section', () => {
    expect(() =>
      buildSetupPrologue({
        devicesDocument: devicesDocument({
          pins: [],
          devices: [{ id: 'd1', driverId: 'dht', name: 'Sensor', params: {} }],
        }),
        drivers: [dhtDriver],
      }),
    ).toThrow(/device "Sensor" uses driver "dht", which has no "device" section/);
  });
});

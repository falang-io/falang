import 'reflect-metadata';
import { observable } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import type { IDriverConfig } from '../../shared/driver-config.js';
import type { IDevicesDocumentData } from '../../shared/devices-document.js';
import { DevicesDocumentStore } from './devices-document-store.js';
import type { DesktopDocument } from './arduino-project-store.js';

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
      fields: [
        {
          name: 'address',
          label: 'I2C address',
          kind: 'select',
          default: '39',
          options: [{ value: '39', label: '0x27' }],
        },
      ],
      codeTemplate: 'lcd_clear(${address})',
    },
  ],
  device: {
    fields: [
      {
        name: 'address',
        label: 'I2C address',
        kind: 'select',
        default: '39',
        options: [{ value: '39', label: '0x27' }],
      },
    ],
    setupTemplate: 'lcd_init(${address})',
  },
};

/** A driver with no `device` section — action-only, must never show up in `deviceDrivers`. */
const actionOnlyDriver: IDriverConfig = {
  id: 'servo',
  label: 'Servo',
  includes: ['servo-driver.h'],
  sourceFiles: ['servo-driver.h', 'servo-driver.cpp'],
  declarations: ['declare function servo_write(pin: number, angle: number): void;'],
  actions: [
    {
      id: 'write',
      label: 'Set angle',
      fields: [{ name: 'pin', label: 'Pin', kind: 'pin', default: '9' }],
      codeTemplate: 'servo_write(${pin})',
    },
  ],
};

const makeDocument = (data?: unknown): DesktopDocument => ({
  id: 'devices-doc',
  name: 'Devices',
  type: 'devices',
  folderId: null,
  data,
});

describe('DevicesDocumentStore', () => {
  it('reads non-empty data from a MobX-observable document (as held by ArduinoProjectStore.documents)', () => {
    const data: IDevicesDocumentData = {
      pins: [{ id: 'p1', pin: 13, mode: 'output', label: 'LED' }],
      devices: [{ id: 'd1', driverId: 'lcd1602-i2c', name: 'Front display', params: { address: '39' } }],
    };
    const document = observable(makeDocument(data));
    const store = new DevicesDocumentStore({ document, drivers: [lcdDriver], onChange: vi.fn() });
    expect(store.loadError).toBeNull();
    expect(store.pins).toEqual(data.pins);
    expect(store.devices).toEqual(data.devices);
  });

  it('starts empty for a document with no data yet (a project restored from before this document type existed)', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(), drivers: [lcdDriver], onChange });
    expect(store.pins).toEqual([]);
    expect(store.devices).toEqual([]);
    expect(store.loadError).toBeNull();
  });

  it('parses well-formed data and only offers drivers with a `device` section', () => {
    const data: IDevicesDocumentData = {
      pins: [{ id: 'p1', pin: 13, mode: 'output', label: 'LED' }],
      devices: [{ id: 'd1', driverId: 'lcd1602-i2c', name: 'Front display', params: { address: '39' } }],
    };
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({
      document: makeDocument(data),
      drivers: [lcdDriver, actionOnlyDriver],
      onChange,
    });
    expect(store.pins).toEqual(data.pins);
    expect(store.devices).toEqual(data.devices);
    expect(store.deviceDrivers).toEqual([lcdDriver]);
  });

  it('falls back to empty data and sets loadError on malformed data', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument({ pins: 'not-an-array' }), drivers: [], onChange });
    expect(store.pins).toEqual([]);
    expect(store.devices).toEqual([]);
    expect(store.loadError).toBeTruthy();
  });

  it('addPin() picks the next free pin number starting at 0, defaults mode to output, and emits a change', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(), drivers: [], onChange });
    store.addPin();
    store.addPin();
    expect(store.pins.map((pin) => pin.pin)).toEqual([0, 1]);
    expect(store.pins[0].mode).toBe('output');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ pins: store.pins, devices: [] });
  });

  it('addPin() fills the first gap rather than always appending', () => {
    const data: IDevicesDocumentData = {
      pins: [
        { id: 'p0', pin: 0, mode: 'output' },
        { id: 'p2', pin: 2, mode: 'output' },
      ],
      devices: [],
    };
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(data), drivers: [], onChange });
    store.addPin();
    expect(store.pins.map((pin) => pin.pin)).toEqual([0, 2, 1]);
  });

  it('updatePin()/removePin() mutate by id without touching other rows', () => {
    const data: IDevicesDocumentData = {
      pins: [
        { id: 'p1', pin: 2, mode: 'output' },
        { id: 'p2', pin: 3, mode: 'input' },
      ],
      devices: [],
    };
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(data), drivers: [], onChange });

    store.updatePin('p1', { mode: 'input-pullup', label: 'Button' });
    expect(store.pins[0]).toEqual({ id: 'p1', pin: 2, mode: 'input-pullup', label: 'Button' });
    expect(store.pins[1]).toEqual({ id: 'p2', pin: 3, mode: 'input' });

    store.removePin('p2');
    expect(store.pins.map((pin) => pin.id)).toEqual(['p1']);
  });

  it('updatePin() with an unknown id is a no-op (no change emitted)', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(), drivers: [], onChange });
    store.updatePin('missing', { pin: 5 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("addDevice() seeds params from the driver's device.fields defaults and names the instance after the driver", () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(), drivers: [lcdDriver], onChange });
    store.addDevice('lcd1602-i2c');
    expect(store.devices).toHaveLength(1);
    expect(store.devices[0]).toMatchObject({
      driverId: 'lcd1602-i2c',
      name: 'LCD1602 (I2C)',
      params: { address: '39' },
    });
  });

  it('addDevice() with a driver that has no device section (or an unknown id) is a no-op', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({
      document: makeDocument(),
      drivers: [lcdDriver, actionOnlyDriver],
      onChange,
    });
    store.addDevice('servo');
    store.addDevice('nonexistent');
    expect(store.devices).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updateDeviceName()/updateDeviceParam()/removeDevice() mutate by id', () => {
    const onChange = vi.fn();
    const store = new DevicesDocumentStore({ document: makeDocument(), drivers: [lcdDriver], onChange });
    store.addDevice('lcd1602-i2c');
    const id = store.devices[0].id;

    store.updateDeviceName(id, 'Front display');
    expect(store.devices[0].name).toBe('Front display');

    store.updateDeviceParam(id, 'address', '62');
    expect(store.devices[0].params).toEqual({ address: '62' });

    store.removeDevice(id);
    expect(store.devices).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { IDriverConfig } from './driver-config.js';
import { formatDevicesIssues, prepareDevicesData } from './devices-validation.js';

const lcd: IDriverConfig = {
  actions: [],
  declarations: [],
  device: {
    fields: [
      { kind: 'number', label: 'Address', max: 127, min: 0, name: 'address' },
      { default: 'true', kind: 'boolean', label: 'Backlight', name: 'backlight' },
      {
        kind: 'select',
        label: 'Cols',
        name: 'cols',
        options: [
          { label: '16', value: '16' },
          { label: '20', value: '20' },
        ],
      },
    ],
    setupTemplate: 'lcd_init(${address})',
  },
  id: 'lcd',
  includes: [],
  label: 'LCD',
  sourceFiles: [],
} as unknown as IDriverConfig;
const plain = {
  actions: [],
  declarations: [],
  id: 'plain',
  includes: [],
  label: 'P',
  sourceFiles: [],
} as unknown as IDriverConfig;

const input = (device: Record<string, unknown>) => ({
  devices: [{ driverId: 'lcd', name: 'Front', ...device }],
  pins: [{ mode: 'output', pin: 13 }],
});

describe('prepareDevicesData', () => {
  it('accepts a valid document, generating ids and filling defaults', () => {
    const result = prepareDevicesData(input({ params: { address: '39', cols: '16' } }), [lcd, plain]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pins[0]?.id).toBeTruthy();
    expect(result.data.devices[0]?.params).toEqual({ address: '39', backlight: 'true', cols: '16' });
  });

  it('rejects an unknown driver', () => {
    const result = prepareDevicesData(input({ driverId: 'nope' }), [lcd]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe('devices[0].driverId');
  });

  it('rejects a driver without a device section', () => {
    const result = prepareDevicesData(input({ driverId: 'plain' }), [lcd, plain]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(formatDevicesIssues(result.errors)).toContain('no "device" section');
  });

  it('rejects bad field values with the path', () => {
    const result = prepareDevicesData(input({ params: { address: '300', cols: '17' } }), [lcd]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = formatDevicesIssues(result.errors);
    expect(text).toContain('devices[0].params.address: field "address" must be <= 127');
    expect(text).toContain('devices[0].params.cols');
  });

  it('rejects unknown params, duplicate pins and malformed input', () => {
    const unknown = prepareDevicesData(input({ params: { address: '1', cols: '16', bogus: 'x' } }), [lcd]);
    expect(unknown.ok).toBe(false);
    const dup = prepareDevicesData(
      {
        devices: [],
        pins: [
          { mode: 'output', pin: 2 },
          { mode: 'input', pin: 2 },
        ],
      },
      [lcd],
    );
    expect(dup.ok).toBe(false);
    expect(prepareDevicesData('x', [lcd]).ok).toBe(false);
    expect(prepareDevicesData({ devices: [], pins: [{ mode: 'wat', pin: 1 }] }, [lcd]).ok).toBe(false);
  });
});

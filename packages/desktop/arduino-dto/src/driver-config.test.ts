import { describe, expect, it } from 'vitest';
import { DriverConfigValidationError, parseDriverConfig } from './driver-config.js';

const validConfig = () => ({
  id: 'dht',
  label: 'DHT11 / DHT22',
  includes: ['dht-driver.h'],
  sourceFiles: ['dht-driver.h', 'dht-driver.cpp'],
  declarations: ['declare function dht_read_temperature(pin: number, sensorType: number): number;'],
  actions: [
    {
      id: 'read-temperature',
      label: 'Read temperature',
      fields: [
        { name: 'pin', label: 'Pin', kind: 'pin', default: '2' },
        { name: 'variable', label: 'Result', kind: 'new-variable', default: 'temperature' },
      ],
      codeTemplate: 'dht_read_temperature(${pin}, 1)',
      resultType: 'float',
    },
  ],
});

describe('parseDriverConfig', () => {
  it('parses a well-formed config', () => {
    const config = parseDriverConfig(validConfig());
    expect(config.id).toBe('dht');
    expect(config.actions).toHaveLength(1);
  });

  it('rejects a non-kebab-case driver id', () => {
    expect(() => parseDriverConfig({ ...validConfig(), id: 'DHT_Sensor' })).toThrow(DriverConfigValidationError);
  });

  it('rejects a codeTemplate placeholder with no matching field', () => {
    const config = validConfig();
    config.actions[0].codeTemplate = 'dht_read_temperature(${pin}, ${sensorType})';
    expect(() => parseDriverConfig(config)).toThrow(/unknown field "sensorType"/);
  });

  it('rejects resultType set without a new-variable field', () => {
    const config = validConfig();
    config.actions[0].fields = config.actions[0].fields.filter((field) => field.kind !== 'new-variable');
    expect(() => parseDriverConfig(config)).toThrow(/no "new-variable" field exists/);
  });

  it('rejects a new-variable field with no resultType', () => {
    const config = validConfig();
    delete (config.actions[0] as { resultType?: string }).resultType;
    expect(() => parseDriverConfig(config)).toThrow(/no resultType/);
  });

  it('rejects a select field with no options', () => {
    const config = validConfig();
    config.actions[0].fields.push({ name: 'mode', label: 'Mode', kind: 'select' } as never);
    expect(() => parseDriverConfig(config)).toThrow(/no options/);
  });

  it('rejects a select option with a non-numeric value', () => {
    const config = validConfig();
    config.actions[0].fields.push({
      name: 'mode',
      label: 'Mode',
      kind: 'select',
      options: [{ value: 'fast', label: 'Fast' }],
    } as never);
    expect(() => parseDriverConfig(config)).toThrow(DriverConfigValidationError);
  });

  it('rejects a declarations entry that is not a declare line', () => {
    const config = validConfig();
    config.declarations.push('function evil() { /* not a declare line */ }');
    expect(() => parseDriverConfig(config)).toThrow(DriverConfigValidationError);
  });

  it('rejects a sourceFiles entry with a path separator (no directory traversal)', () => {
    const config = validConfig();
    config.sourceFiles.push('../../etc/passwd');
    expect(() => parseDriverConfig(config)).toThrow(DriverConfigValidationError);
  });
});

describe('parseDriverConfig — device section (ADR 0032 (private))', () => {
  const validDeviceConfig = () => ({
    ...validConfig(),
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
  });

  it('parses a well-formed device section', () => {
    const config = parseDriverConfig(validDeviceConfig());
    expect(config.device?.setupTemplate).toBe('lcd_init(${address})');
    expect(config.device?.fields).toHaveLength(1);
  });

  it('rejects a setupTemplate placeholder with no matching device field', () => {
    const config = validDeviceConfig();
    config.device.setupTemplate = 'lcd_init(${address}, ${brightness})';
    expect(() => parseDriverConfig(config)).toThrow(/unknown field "brightness"/);
  });

  it('rejects a "new-variable" field in a device section — a setup line declares nothing', () => {
    const config = validDeviceConfig();
    config.device.fields.push({
      name: 'result',
      label: 'Result',
      kind: 'new-variable',
      default: 'x',
    } as never);
    expect(() => parseDriverConfig(config)).toThrow(/cannot be "new-variable"/);
  });

  it('has no device section by default', () => {
    const config = parseDriverConfig(validConfig());
    expect(config.device).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { IDriverActionDescriptor, IDriverFieldDescriptor } from '@falang/desktop-arduino-dto';
import { substituteDriverTemplate, substituteTemplate, toTsTemplateLiteral } from './substitute-driver-template.js';

describe('toTsTemplateLiteral', () => {
  it('wraps a plain string in backticks', () => {
    expect(toTsTemplateLiteral('Hello!')).toBe('`Hello!`');
  });

  it('leaves double quotes untouched (no longer double-quote syntax)', () => {
    expect(toTsTemplateLiteral('say "hi"')).toBe('`say "hi"`');
  });

  it('escapes a lone backslash', () => {
    expect(toTsTemplateLiteral(String.raw`a\b`)).toBe('`a\\\\b`');
  });

  it('escapes a backtick', () => {
    expect(toTsTemplateLiteral('a`b')).toBe('`a\\`b`');
  });

  it('leaves a ${expr} interpolation untouched', () => {
    expect(toTsTemplateLiteral('Привет, ${name}!')).toBe('`Привет, ${name}!`');
  });
});

describe('substituteDriverTemplate', () => {
  it('substitutes pin/number/select fields raw and skips new-variable fields', () => {
    const action: IDriverActionDescriptor = {
      id: 'read-temperature',
      label: 'Read temperature',
      fields: [
        { name: 'pin', label: 'Pin', kind: 'pin' },
        { name: 'sensorType', label: 'Sensor', kind: 'select', options: [{ value: '1', label: 'DHT22' }] },
        { name: 'variable', label: 'Result', kind: 'new-variable' },
      ],
      codeTemplate: 'dht_read_temperature(${pin}, ${sensorType})',
      resultType: 'float',
    };
    const code = substituteDriverTemplate(action, { pin: '2', sensorType: '1', variable: 'temperature' });
    expect(code).toBe('dht_read_temperature(2, 1)');
  });

  it('substitutes a string field as a TS template literal', () => {
    const action: IDriverActionDescriptor = {
      id: 'print-text',
      label: 'Print text',
      fields: [{ name: 'text', label: 'Text', kind: 'string' }],
      codeTemplate: 'lcd_print_text(39, 0, 0, ${text})',
    };
    const code = substituteDriverTemplate(action, { text: 'say "hi"' });
    expect(code).toBe('lcd_print_text(39, 0, 0, `say "hi"`)');
  });

  it('preserves a ${expr} interpolation inside a string field, letting it compile as a real TS expression later', () => {
    const action: IDriverActionDescriptor = {
      id: 'print-text',
      label: 'Print text',
      fields: [
        { name: 'row', label: 'Row', kind: 'number' },
        { name: 'text', label: 'Text', kind: 'string' },
      ],
      codeTemplate: 'lcd_print_text(0, ${row}, ${text})',
    };
    const code = substituteDriverTemplate(action, { row: '1', text: 'Row: ${row}' });
    expect(code).toBe('lcd_print_text(0, 1, `Row: ${row}`)');
  });

  it('falls back to a field default when data has no entry for it', () => {
    const action: IDriverActionDescriptor = {
      id: 'set-angle',
      label: 'Set angle',
      fields: [
        { name: 'pin', label: 'Pin', kind: 'pin', default: '9' },
        { name: 'angle', label: 'Angle', kind: 'number', default: '90' },
      ],
      codeTemplate: 'servo_set_angle(${pin}, ${angle})',
    };
    expect(substituteDriverTemplate(action, {})).toBe('servo_set_angle(9, 90)');
  });
});

describe('substituteTemplate — generalized over a plain template + fields (ADR 0032 (private), the setup-prologue caller)', () => {
  it('substitutes a device setupTemplate the same way substituteDriverTemplate substitutes an action codeTemplate', () => {
    const fields: IDriverFieldDescriptor[] = [
      {
        name: 'address',
        label: 'I2C address',
        kind: 'select',
        default: '39',
        options: [{ value: '39', label: '0x27' }],
      },
    ];
    expect(substituteTemplate('lcd_init(${address})', fields, { address: '39' })).toBe('lcd_init(39)');
  });

  it('substituteDriverTemplate is a thin wrapper over substituteTemplate — same result either way', () => {
    const action: IDriverActionDescriptor = {
      id: 'set-angle',
      label: 'Set angle',
      fields: [{ name: 'pin', label: 'Pin', kind: 'pin', default: '9' }],
      codeTemplate: 'servo_set_angle(${pin})',
    };
    expect(substituteDriverTemplate(action, { pin: '3' })).toBe(
      substituteTemplate(action.codeTemplate, action.fields, { pin: '3' }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto';
import { lowerDriverNodes } from './lower-driver-nodes.js';

const document = (root: INode): IProjectDocument => ({ id: 'doc', type: 'function', name: 'loop', root });

const dhtDriver: IDriverConfig = {
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
        { name: 'sensorType', label: 'Sensor', kind: 'select', default: '1', options: [{ value: '1', label: 'DHT22' }] },
        { name: 'variable', label: 'Result', kind: 'new-variable', default: 'temperature' },
      ],
      codeTemplate: 'dht_read_temperature(${pin}, ${sensorType})',
      resultType: 'float',
    },
  ],
};

const servoDriver: IDriverConfig = {
  id: 'servo',
  label: 'Servo',
  includes: ['servo-driver.h'],
  sourceFiles: ['servo-driver.h', 'servo-driver.cpp'],
  declarations: ['declare function servo_set_angle(pin: number, angle: number): void;'],
  actions: [
    {
      id: 'set-angle',
      label: 'Set angle',
      fields: [
        { name: 'pin', label: 'Pin', kind: 'pin', default: '9' },
        { name: 'angle', label: 'Angle', kind: 'number', default: '90' },
      ],
      codeTemplate: 'servo_set_angle(${pin}, ${angle})',
    },
  ],
};

const lcdDriver: IDriverConfig = {
  id: 'lcd1602-i2c',
  label: 'LCD1602 (I2C)',
  includes: ['lcd1602-i2c-driver.h'],
  sourceFiles: ['lcd1602-i2c-driver.h', 'lcd1602-i2c-driver.cpp'],
  declarations: ['declare function lcd_print_text(col: number, row: number, text: string): void;'],
  actions: [
    {
      id: 'print-text',
      label: 'Print text',
      fields: [
        { name: 'col', label: 'Column', kind: 'number', default: '0' },
        { name: 'row', label: 'Row', kind: 'number', default: '0' },
        { name: 'text', label: 'Text', kind: 'string', default: 'Hello!' },
      ],
      codeTemplate: 'lcd_print_text(${col}, ${row}, ${text})',
    },
  ],
};

describe('lowerDriverNodes', () => {
  it('lowers a "string"-kind field into a TS template literal, preserving a ${expr} interpolation', () => {
    const node: INode = {
      id: 'a',
      name: 'driver-action::lcd1602-i2c::print-text',
      data: { col: '0', row: '0', text: 'Привет, ${name}!' },
    };
    const { documents } = lowerDriverNodes([document(node)], [lcdDriver]);
    expect(documents[0]?.root).toEqual({ id: 'a', name: 'action', data: 'lcd_print_text(0, 0, `Привет, ${name}!`)' });
  });


  it('lowers a driver action with a resultType into a create-var and records the used driver', () => {
    const node: INode = {
      id: 'a',
      name: 'driver-action::dht::read-temperature',
      data: { pin: '3', sensorType: '1', variable: 'temp' },
    };
    const { documents, usedDriverIds } = lowerDriverNodes([document(node)], [dhtDriver, servoDriver]);

    expect(documents[0]?.root).toEqual({
      id: 'a',
      name: 'create-var',
      data: {
        name: 'temp',
        variableType: { type: 'number', numberType: { type: 'float', floatType: 'float32' } },
        value: 'dht_read_temperature(3, 1)',
      },
    });
    expect(usedDriverIds).toEqual(new Set(['dht']));
  });

  it('lowers a void driver action into a plain action node', () => {
    const node: INode = { id: 'a', name: 'driver-action::servo::set-angle', data: { pin: '9', angle: '45' } };
    const { documents, usedDriverIds } = lowerDriverNodes([document(node)], [dhtDriver, servoDriver]);

    expect(documents[0]?.root).toEqual({ id: 'a', name: 'action', data: 'servo_set_angle(9, 45)' });
    expect(usedDriverIds).toEqual(new Set(['servo']));
  });

  it('lowers driver nodes nested inside other statement containers', () => {
    const root: INode = {
      id: 'body',
      name: 'function-body',
      data: { parameters: [] },
      children: [{ id: 'a', name: 'driver-action::servo::set-angle', data: { pin: '9', angle: '45' } }],
    };
    const { documents } = lowerDriverNodes([document(root)], [servoDriver]);
    expect(documents[0]?.root?.children?.[0]).toEqual({ id: 'a', name: 'action', data: 'servo_set_angle(9, 45)' });
  });

  it('leaves non-driver nodes untouched and reports no used drivers', () => {
    const node: INode = { id: 'a', name: 'action', data: 'delay(1000)' };
    const { documents, usedDriverIds } = lowerDriverNodes([document(node)], [dhtDriver]);
    expect(documents[0]?.root).toEqual(node);
    expect(usedDriverIds.size).toBe(0);
  });

  it('throws a clear error for an unknown driver id', () => {
    const node: INode = { id: 'a', name: 'driver-action::missing::read', data: {} };
    expect(() => lowerDriverNodes([document(node)], [dhtDriver])).toThrow(/Unknown driver "missing"/);
  });

  it('throws a clear error for a known driver with an unknown action id', () => {
    const node: INode = { id: 'a', name: 'driver-action::dht::read-pressure', data: {} };
    expect(() => lowerDriverNodes([document(node)], [dhtDriver])).toThrow(/no action "read-pressure"/);
  });
});

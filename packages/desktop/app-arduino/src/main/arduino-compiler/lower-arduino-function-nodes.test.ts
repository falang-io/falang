import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { lowerArduinoFunctionNodesInDocument } from './lower-arduino-function-nodes.js';

const document = (root: INode): IProjectDocument => ({ id: 'doc', type: 'function', name: 'setup', root });

describe('lowerArduinoFunctionNodesInDocument', () => {
  it('lowers delay into an action calling delay', () => {
    const node: INode = { id: 'a', name: 'delay', data: { value: 500 } };
    expect(lowerArduinoFunctionNodesInDocument(document(node)).root).toEqual({
      id: 'a',
      name: 'action',
      data: 'delay(500)',
    });
  });

  it('lowers delay-microseconds into an action calling delayMicroseconds', () => {
    const node: INode = { id: 'a', name: 'delay-microseconds', data: { value: 100 } };
    expect(lowerArduinoFunctionNodesInDocument(document(node)).root).toEqual({
      id: 'a',
      name: 'action',
      data: 'delayMicroseconds(100)',
    });
  });

  it('lowers random-seed into an action calling randomSeed', () => {
    const node: INode = { id: 'a', name: 'random-seed', data: { value: 42 } };
    expect(lowerArduinoFunctionNodesInDocument(document(node)).root).toEqual({
      id: 'a',
      name: 'action',
      data: 'randomSeed(42)',
    });
  });

  it('lowers serial-begin/serial-print/serial-println into Serial.* actions', () => {
    expect(
      lowerArduinoFunctionNodesInDocument(document({ id: 'a', name: 'serial-begin', data: { value: 9600 } })).root,
    ).toEqual({ id: 'a', name: 'action', data: 'Serial.begin(9600)' });
    expect(
      lowerArduinoFunctionNodesInDocument(document({ id: 'a', name: 'serial-print', data: { value: 1 } })).root,
    ).toEqual({ id: 'a', name: 'action', data: 'Serial.print(1)' });
    expect(
      lowerArduinoFunctionNodesInDocument(document({ id: 'a', name: 'serial-println', data: { value: 1 } })).root,
    ).toEqual({ id: 'a', name: 'action', data: 'Serial.println(1)' });
  });

  it('lowers millis/micros into a create-var initialized from the zero-arg call', () => {
    const millisNode: INode = { id: 'a', name: 'millis', data: { variable: 'currentMillis' } };
    expect(lowerArduinoFunctionNodesInDocument(document(millisNode)).root).toEqual({
      id: 'a',
      name: 'create-var',
      data: {
        name: 'currentMillis',
        variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
        value: 'millis()',
      },
    });

    const microsNode: INode = { id: 'a', name: 'micros', data: { variable: 'currentMicros' } };
    const lowered = lowerArduinoFunctionNodesInDocument(document(microsNode)).root;
    expect(lowered?.data).toMatchObject({ value: 'micros()' });
  });

  it('lowers random into a create-var initialized from random(max)', () => {
    const node: INode = { id: 'a', name: 'random', data: { max: 100, variable: 'roll' } };
    const lowered = lowerArduinoFunctionNodesInDocument(document(node)).root;
    expect(lowered).toEqual({
      id: 'a',
      name: 'create-var',
      data: {
        name: 'roll',
        variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
        value: 'random(100)',
      },
    });
  });

  it('lowers nodes nested inside other statement containers', () => {
    const root: INode = {
      id: 'body',
      name: 'function-body',
      data: { parameters: [] },
      children: [{ id: 'a', name: 'delay', data: { value: 250 } }],
    };
    const lowered = lowerArduinoFunctionNodesInDocument(document(root)).root;
    expect(lowered?.children?.[0]).toEqual({ id: 'a', name: 'action', data: 'delay(250)' });
  });

  it('leaves other nodes and documents without a root untouched', () => {
    const node: INode = { id: 'a', name: 'action', data: 'digitalWrite(13, HIGH)' };
    expect(lowerArduinoFunctionNodesInDocument(document(node)).root).toEqual(node);
    expect(lowerArduinoFunctionNodesInDocument({ id: 'doc', type: 'function', name: 'setup' })).toEqual({
      id: 'doc',
      type: 'function',
      name: 'setup',
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { lowerPinNodesInDocument } from './lower-pin-nodes.js';

const document = (root: INode): IProjectDocument => ({ id: 'doc', type: 'function', name: 'setup', root });

describe('lowerPinNodesInDocument', () => {
  it('lowers pin-write-digital into an action calling digitalWrite with HIGH/LOW', () => {
    const highNode: INode = { id: 'a', name: 'pin-write-digital', data: { pin: 13, value: true } };
    const lowNode: INode = { id: 'b', name: 'pin-write-digital', data: { pin: 13, value: false } };

    expect(lowerPinNodesInDocument(document(highNode)).root).toEqual({
      id: 'a',
      name: 'action',
      data: 'digitalWrite(13, HIGH)',
    });
    expect(lowerPinNodesInDocument(document(lowNode)).root).toEqual({
      id: 'b',
      name: 'action',
      data: 'digitalWrite(13, LOW)',
    });
  });

  it('lowers pin-write-analog into an action calling analogWrite', () => {
    const node: INode = { id: 'a', name: 'pin-write-analog', data: { pin: 9, value: 128 } };
    expect(lowerPinNodesInDocument(document(node)).root).toEqual({
      id: 'a',
      name: 'action',
      data: 'analogWrite(9, 128)',
    });
  });

  it('lowers pin-read-digital into a create-var initialized from digitalRead', () => {
    const node: INode = { id: 'a', name: 'pin-read-digital', data: { pin: 2, variable: 'buttonState' } };
    expect(lowerPinNodesInDocument(document(node)).root).toEqual({
      id: 'a',
      name: 'create-var',
      data: {
        name: 'buttonState',
        variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
        value: 'digitalRead(2)',
      },
    });
  });

  it('lowers pin-read-analog into a create-var initialized from analogRead(A<pin>)', () => {
    const node: INode = { id: 'a', name: 'pin-read-analog', data: { pin: 0, variable: 'sensorValue' } };
    const lowered = lowerPinNodesInDocument(document(node)).root;
    expect(lowered?.data).toMatchObject({ value: 'analogRead(A0)' });
  });

  it('lowers pin nodes nested inside other statement containers', () => {
    const root: INode = {
      id: 'body',
      name: 'function-body',
      data: { parameters: [] },
      children: [{ id: 'a', name: 'pin-write-digital', data: { pin: 13, value: true } }],
    };
    const lowered = lowerPinNodesInDocument(document(root)).root;
    expect(lowered?.children?.[0]).toEqual({ id: 'a', name: 'action', data: 'digitalWrite(13, HIGH)' });
  });

  it('leaves non-pin nodes and documents without a root untouched', () => {
    const node: INode = { id: 'a', name: 'action', data: 'delay(1000)' };
    expect(lowerPinNodesInDocument(document(node)).root).toEqual(node);
    expect(lowerPinNodesInDocument({ id: 'doc', type: 'function', name: 'setup' })).toEqual({
      id: 'doc',
      type: 'function',
      name: 'setup',
    });
  });
});

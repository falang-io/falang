import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { compileArduinoProject } from './compile-arduino-project.js';

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

describe('compileArduinoProject — built-in-function nodes (ADR 0023 (private))', () => {
  it('compiles the pin-less Arduino built-in-function nodes end-to-end through the lowering pass', () => {
    const setup = functionNode({
      id: 'doc-setup',
      body: [{ id: 's', name: 'serial-begin', data: { value: 9600 } }],
    });
    const loop = functionNode({
      id: 'doc-loop',
      body: [
        { id: 'd', name: 'delay', data: { value: 500 } },
        { id: 'du', name: 'delay-microseconds', data: { value: 50 } },
        { id: 'm', name: 'millis', data: { variable: 'currentMillis' } },
        { id: 'mi', name: 'micros', data: { variable: 'currentMicros' } },
        { id: 'rs', name: 'random-seed', data: { value: 7 } },
        { id: 'r', name: 'random', data: { max: 100, variable: 'roll' } },
        { id: 'p', name: 'serial-print', data: { value: 1 } },
        { id: 'pl', name: 'serial-println', data: { value: 2 } },
      ],
    });

    const { code } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
    });

    expect(code).toContain('Serial.begin(9600);');
    expect(code).toContain('delay(500);');
    expect(code).toContain('delayMicroseconds(50);');
    expect(code).toContain('millis()');
    expect(code).toContain('micros()');
    expect(code).toContain('randomSeed(7);');
    expect(code).toContain('random(100)');
    expect(code).toContain('Serial.print(1);');
    expect(code).toContain('Serial.println(2);');
  });
});

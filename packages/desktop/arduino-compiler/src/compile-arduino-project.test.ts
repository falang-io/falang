import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto';
import { ArduinoProjectCompileError, compileArduinoProject } from './compile-arduino-project.js';

interface IFunctionNodeParams {
  readonly id: string;
  readonly parameters?: { name: string; type: unknown }[];
  readonly returnValue?: unknown;
  readonly body: INode[];
}

const functionNode = ({ id, parameters = [], returnValue, body }: IFunctionNodeParams): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters, returnValue }, children: body },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

const int32 = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('compileArduinoProject', () => {
  it('compiles setup/loop into a sketch with an Arduino preamble, real builtin calls, and no int main()', () => {
    const setup = functionNode({ id: 'doc-setup', body: [{ id: 'a', name: 'action', data: 'pinMode(13, OUTPUT)' }] });
    const loop = functionNode({
      id: 'doc-loop',
      body: [
        { id: 'a1', name: 'action', data: 'digitalWrite(13, HIGH)' },
        { id: 'a2', name: 'action', data: 'delay(1000)' },
        { id: 'a3', name: 'action', data: 'digitalWrite(13, LOW)' },
        { id: 'a4', name: 'action', data: 'delay(1000)' },
      ],
    });

    const { code } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
    });

    expect(code).toContain('#include <Arduino.h>');
    expect(code).not.toMatch(/int main\(\)/);
    expect(code).toContain('void setup() {');
    expect(code).toContain('pinMode(13, OUTPUT);');
    expect(code).toContain('void loop() {');
    expect(code).toContain('digitalWrite(13, HIGH);');
    expect(code).toContain('delay(1000);');
  });

  it('compiles pin-write/pin-read nodes end-to-end through the lowering pass', () => {
    const setup = functionNode({ id: 'doc-setup', body: [{ id: 'a', name: 'action', data: 'pinMode(2, INPUT)' }] });
    const loop = functionNode({
      id: 'doc-loop',
      body: [
        { id: 'r', name: 'pin-read-digital', data: { pin: 2, variable: 'buttonState' } },
        { id: 'w', name: 'pin-write-digital', data: { pin: 13, value: true } },
        { id: 'a', name: 'pin-write-analog', data: { pin: 9, value: 200 } },
      ],
    });

    const { code } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
    });

    expect(code).toContain('digitalRead(2)');
    expect(code).toContain('digitalWrite(13, HIGH);');
    expect(code).toContain('analogWrite(9, 200);');
  });

  it('compiles a helper function and lets loop call it via call-function', () => {
    const helper = functionNode({
      id: 'doc-blink',
      body: [{ id: 'a', name: 'action', data: 'digitalWrite(13, HIGH)' }],
    });
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({
      id: 'doc-loop',
      body: [{ id: 'c', name: 'call-function', data: { schemeId: 'doc-blink', parameters: [], returnVariable: '' } }],
    });

    const { code } = compileArduinoProject({
      documents: [
        functionDocument('doc-blink', 'blink', helper),
        functionDocument('doc-setup', 'setup', setup),
        functionDocument('doc-loop', 'loop', loop),
      ],
    });

    expect(code).toContain('void blink() {');
    expect(code).toContain('blink();');
  });

  it('throws a clear error when setup is missing', () => {
    const loop = functionNode({ id: 'doc-loop', body: [] });
    expect(() => compileArduinoProject({ documents: [functionDocument('doc-loop', 'loop', loop)] })).toThrow(
      /requires a function document named "setup"/,
    );
  });

  it('throws a clear error when loop is missing', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    expect(() => compileArduinoProject({ documents: [functionDocument('doc-setup', 'setup', setup)] })).toThrow(
      /requires a function document named "loop"/,
    );
  });

  it('rejects a setup with parameters', () => {
    const setup = functionNode({ id: 'doc-setup', parameters: [{ name: 'n', type: int32 }], body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });
    expect(() =>
      compileArduinoProject({
        documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
      }),
    ).toThrow(/must take no parameters/);
  });

  it('rejects a loop that returns a value', () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(() =>
      compileArduinoProject({
        documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
      }),
    ).toThrow(/must return void/);
  });

  it("collects a per-document compile error without losing the other documents' compiled output", () => {
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [{ id: 'a', name: 'unknown-node-kind' } as unknown as INode] });

    const caught: unknown = ((): unknown => {
      try {
        compileArduinoProject({
          documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
        });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(ArduinoProjectCompileError);
    const compileError = caught as ArduinoProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-loop');
    expect(compileError.partialCode).toContain('void setup()');
  });

  it('compiles a driver-action node end-to-end: #include, ambient declaration, and lowered call', () => {
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

    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({
      id: 'doc-loop',
      body: [{ id: 'a', name: 'driver-action::servo::set-angle', data: { pin: '9', angle: '45' } }],
    });

    const { code, usedDriverIds } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
      drivers: [servoDriver],
    });

    expect(code).toContain('#include "servo-driver.h"');
    expect(code).toContain('servo_set_angle(9, 45);');
    expect(usedDriverIds).toEqual(new Set(['servo']));
  });

  it('does not #include an unused driver', () => {
    const unusedDriver: IDriverConfig = {
      id: 'dht',
      label: 'DHT',
      includes: ['dht-driver.h'],
      sourceFiles: ['dht-driver.h', 'dht-driver.cpp'],
      declarations: [],
      actions: [
        { id: 'read-temperature', label: 'Read temperature', fields: [], codeTemplate: 'dht_read_temperature()' },
      ],
    };
    const setup = functionNode({ id: 'doc-setup', body: [] });
    const loop = functionNode({ id: 'doc-loop', body: [] });

    const { code, usedDriverIds } = compileArduinoProject({
      documents: [functionDocument('doc-setup', 'setup', setup), functionDocument('doc-loop', 'loop', loop)],
      drivers: [unusedDriver],
    });

    expect(code).not.toContain('dht-driver.h');
    expect(usedDriverIds.size).toBe(0);
  });
});

describe('compileArduinoProject — debug instrumentation (ADR 0021 (private) §6)', () => {
  const setupDoc = functionDocument('doc-setup', 'setup', functionNode({ id: 'doc-setup', body: [] }));
  const loopDoc = functionDocument(
    'doc-loop',
    'loop',
    functionNode({
      id: 'doc-loop',
      body: [
        { id: 'v1', name: 'create-var', data: { name: 'x', variableType: int32 } },
        { id: 'a1', name: 'action', data: 'digitalWrite(13, HIGH)' },
      ],
    }),
  );

  it('without debug, no debugMap/debugHeader and no falang_debug.h include', () => {
    const result = compileArduinoProject({ documents: [setupDoc, loopDoc] });
    expect(result.debugMap).toBeUndefined();
    expect(result.debugHeader).toBeUndefined();
    expect(result.code).not.toContain('falang_debug.h');
  });

  it('with debug: true, includes falang_debug.h, traces both setup and loop statements, and returns a matching IDebugMap', () => {
    const result = compileArduinoProject({ documents: [setupDoc, loopDoc], debug: true });

    expect(result.code).toContain('#include "falang_debug.h"');
    expect(result.code).toContain('FalangDebugFrame __falang_frame;');
    expect(result.code).toContain('falang_pause();');
    expect(result.debugHeader).toContain('#define FALANG_DEBUG_BP_BYTES');

    // v1 (create-var, no scope yet) and a1 (action, sees x) — two trace points across one document.
    expect(result.debugMap?.tracePoints).toHaveLength(2);
    const byNode = new Map(result.debugMap?.tracePoints.map((point) => [point.nodeId, point]));
    expect(byNode.get('v1')).toMatchObject({ documentId: 'doc-loop', nodeId: 'v1', variables: [] });
    expect(byNode.get('a1')).toMatchObject({
      documentId: 'doc-loop',
      nodeId: 'a1',
      variables: [{ name: 'x', type: 'int' }],
    });
  });

  it('indexes stay dense and unique across every document in the project, not just within one function', () => {
    const result = compileArduinoProject({ documents: [setupDoc, loopDoc], debug: true });
    const indexes = (result.debugMap?.tracePoints ?? []).map((point) => point.index).toSorted((a, b) => a - b);
    expect(indexes).toEqual([0, 1]);
  });

  it('with debug: true, setup() begins Serial at the monitor baud rate and calls falang_wait_attach() before anything else — found live, the panel hung on "Starting…" forever without this (ADR 0021 (private) §6 says setup() "starts with falang_wait_attach()", but nothing ever called it)', () => {
    const result = compileArduinoProject({ documents: [setupDoc, loopDoc], debug: true });
    const setupBody = result.code.slice(result.code.indexOf('void setup() {'));
    expect(setupBody).toContain('void setup() {\n  Serial.begin(115200);\n  falang_wait_attach();\n');
    // Never in loop() — the handshake is setup()'s job alone.
    const loopBody = result.code.slice(result.code.indexOf('void loop() {'), result.code.indexOf('void setup() {'));
    expect(loopBody).not.toContain('falang_wait_attach()');
  });

  it('without debug: true, setup() is untouched — no Serial.begin/falang_wait_attach in a normal build', () => {
    const result = compileArduinoProject({ documents: [setupDoc, loopDoc] });
    expect(result.code).not.toContain('falang_wait_attach');
    expect(result.code).not.toContain('Serial.begin');
  });
});

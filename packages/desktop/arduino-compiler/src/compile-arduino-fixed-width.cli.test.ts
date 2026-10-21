import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { checkArduinoCli, compileSketch, writeSketchFiles } from '@falang/desktop-arduino-cli';
import { compileArduinoProject } from './compile-arduino-project.js';

// Real `arduino-cli compile` (AVR) — skipped when the CLI or the AVR core is not installed.
vi.setConfig({ testTimeout: 180_000 });

const integer = (integerType: string) => ({ type: 'number', numberType: { type: 'integer', integerType } });

const functionDocument = (id: string, name: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: {
    id,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const createVar = (id: string, name: string, integerType: string, value: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType: integer(integerType), value },
});

describe('Arduino sketch with fixed-width integers (ADR 0069 (private))', () => {
  it('maps millis() to uint32_t and compiles for an Uno', async () => {
    const setup = functionDocument('doc-setup', 'setup', [
      { id: 's1', name: 'action', data: 'pinMode(9, OUTPUT)' },
      { id: 's2', name: 'action', data: 'Serial.begin(9600)' },
    ]);
    const loop = functionDocument('doc-loop', 'loop', [
      { id: 'm', name: 'millis', data: { variable: 'now' } },
      createVar('v1', 'small', 'uint8', '200'),
      createVar('v2', 'delta', 'int8', '-100'),
      createVar('v3', 'wide', 'uint16', '60000'),
      createVar('v4', 'big', 'uint64', '10000000000'),
      createVar('v5', 'sum', 'uint32', 'now + wide'),
      createVar('v6', 'half', 'int32', 'delta / 3'),
      { id: 'a1', name: 'action', data: 'small = small - 50' },
      { id: 'a2', name: 'action', data: 'analogWrite(9, small)' },
      { id: 'a3', name: 'action', data: 'Serial.println(sum)' },
      { id: 'a4', name: 'action', data: 'Serial.println(half)' },
      { id: 'a6', name: 'action', data: 'delay(100)' },
      createVar('v7', 'q', 'uint32', 'big / 7'),
    ]);
    const { code } = compileArduinoProject({ documents: [setup, loop] });

    expect(code).toContain('uint32_t now = millis();');
    expect(code).toContain('uint8_t small = 200;');
    expect(code).toContain('int8_t delta = -100;');
    expect(code).toContain('uint64_t big = 10000000000;');
    expect(code).not.toMatch(/\bint (?!main)/);

    const cli = await checkArduinoCli();
    if (!cli.available) return;
    const dir = await mkdtemp(join(tmpdir(), 'falang-arduino-uint-'));
    try {
      const sketchDir = await writeSketchFiles(dir, 'sketch', code, []);
      const result = await compileSketch({ fqbn: 'arduino:avr:uno', sketchDir });
      if (!result.ok && /platform not installed|Unknown FQBN|No such core/iu.test(result.output)) return;
      expect(result.output).toContain('Sketch uses');
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('compiles Math.* calls, increments and compound assignments for an Uno', async () => {
    const setup = functionDocument('doc-setup', 'setup', [{ id: 's1', name: 'action', data: 'Serial.begin(9600)' }]);
    const floatType = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
    const loop = functionDocument('doc-loop', 'loop', [
      createVar('v1', 'x', 'int32', '0'),
      { id: 'a1', name: 'action', data: 'x--' },
      { id: 'a2', name: 'action', data: '++x' },
      { id: 'a3', name: 'action', data: 'x += 5' },
      { id: 'a4', name: 'action', data: 'x *= 2' },
      createVar('v2', 'm', 'int32', 'Math.abs(x) % 2 + Math.min(x, 3) + Math.max(x, 1)'),
      {
        id: 'v3',
        name: 'create-var',
        data: {
          name: 'r',
          variableType: floatType,
          value: 'Math.sqrt(16) + Math.pow(2, 3) + Math.floor(1.5) + Math.ceil(1.5) + Math.round(2.4) + Math.random()',
        },
      },
      { id: 'a5', name: 'action', data: 'Serial.println(m)' },
      { id: 'a6', name: 'action', data: 'Serial.println(r)' },
    ]);
    const { code } = compileArduinoProject({ documents: [setup, loop] });

    expect(code).not.toContain('std::');
    expect(code).toContain('x = x - 1;');
    expect(code).toContain('x = x + (5);');

    const cli = await checkArduinoCli();
    if (!cli.available) return;
    const dir = await mkdtemp(join(tmpdir(), 'falang-arduino-math-'));
    try {
      const sketchDir = await writeSketchFiles(dir, 'sketch', code, []);
      const result = await compileSketch({ fqbn: 'arduino:avr:uno', sketchDir });
      if (!result.ok && /platform not installed|Unknown FQBN|No such core/iu.test(result.output)) return;
      expect(result.output).toContain('Sketch uses');
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('compiles string variables as Arduino String for an Uno', async () => {
    const setup = functionDocument('doc-setup', 'setup', [{ id: 's1', name: 'action', data: 'Serial.begin(9600)' }]);
    const stringType = { type: 'string' };
    const loop = functionDocument('doc-loop', 'loop', [
      { id: 'v1', name: 'create-var', data: { name: 'text', variableType: stringType, value: '"Hello, falang!"' } },
      { id: 'v2', name: 'create-var', data: { name: 'empty', variableType: stringType } },
      createVar('v3', 'x', 'int32', '0'),
      { id: 'a1', name: 'action', data: 'x = -text.length' },
      { id: 'a2', name: 'action', data: 'empty = text + "!"' },
      { id: 'a3', name: 'action', data: 'empty = `x=${x} ${text}`' },
      { id: 'a4', name: 'action', data: 'Serial.println(empty)' },
      { id: 'a5', name: 'action', data: 'Serial.println(text == "Hello, falang!")' },
    ]);
    const { code } = compileArduinoProject({ documents: [setup, loop] });

    expect(code).not.toContain('std::');
    expect(code).toContain('String text = "Hello, falang!";');
    expect(code).toContain('static_cast<int32_t>(text.length())');

    const cli = await checkArduinoCli();
    if (!cli.available) return;
    const dir = await mkdtemp(join(tmpdir(), 'falang-arduino-string-'));
    try {
      const sketchDir = await writeSketchFiles(dir, 'sketch', code, []);
      const result = await compileSketch({ fqbn: 'arduino:avr:uno', sketchDir });
      if (!result.ok && /platform not installed|Unknown FQBN|No such core/iu.test(result.output)) return;
      expect(result.output).toContain('Sketch uses');
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

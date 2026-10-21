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
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { checkArduinoCli, compileSketch, writeSketchFiles } from '@falang/desktop-arduino-cli';
import { compileArduinoProject, FALANG_DEBUG_HEADER_FILENAME } from './compile-arduino-project.js';

// Real `arduino-cli compile` (AVR) — skipped when the CLI or the AVR core is not installed.
vi.setConfig({ testTimeout: 180_000 });

const decimal = (digits: number, decimals: number) => ({
  type: 'number',
  numberType: { type: 'decimal', digits, decimals },
});
const int32 = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

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

const createVar = (id: string, name: string, variableType: unknown, value?: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType, ...(typeof value === 'string' ? { value } : {}) },
});

const action = (id: string, data: string): INode => ({ id, name: 'action', data });

const buildDocuments = (): IProjectDocument[] => {
  const setup = functionDocument('doc-setup', 'setup', [action('s1', 'Serial.begin(9600)')]);
  const loop = functionDocument('doc-loop', 'loop', [
    createVar('v1', 'price', decimal(10, 2), '19.99'),
    createVar('v2', 'qty', int32, '3'),
    createVar('v3', 'rate', decimal(6, 3), '0.075'),
    createVar('v4', 'total', decimal(10, 2)),
    action('a1', 'total = price * qty + price * rate'),
    action('a2', 'total += 0.005'),
    createVar('v5', 'whole', int32, 'total'),
    createVar('v6', 'ratio', decimal(10, 2), 'total / 7'),
    action('a3', 'Serial.println(total)'),
    action('a4', 'Serial.println(whole)'),
    action('a6', 'Serial.println(ratio)'),
    action('a5', 'delay(100)'),
  ]);
  return [setup, loop];
};

describe('Arduino sketch with decimals (ADR 0069 (private) §4)', () => {
  it('compiles decimal variables, arithmetic and printing for an Uno', async () => {
    const { code } = compileArduinoProject({ documents: buildDocuments() });

    expect(code).toContain('FalangDecimal<2> price');
    expect(code).toContain('struct FalangDec {');

    const cli = await checkArduinoCli();
    if (!cli.available) return;
    const dir = await mkdtemp(join(tmpdir(), 'falang-arduino-decimal-'));
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

  it('traces a decimal variable as a float in a debug build and compiles for an Uno', async () => {
    const { code, debugHeader } = compileArduinoProject({ documents: buildDocuments(), debug: true });
    expect(code).toContain('falang_var(0, (float)price.toDouble());');

    const cli = await checkArduinoCli();
    if (!cli.available) return;
    const dir = await mkdtemp(join(tmpdir(), 'falang-arduino-decimal-debug-'));
    try {
      const sketchDir = await writeSketchFiles(dir, 'sketch', code, [
        { relativePath: FALANG_DEBUG_HEADER_FILENAME, content: debugHeader ?? '' },
      ]);
      const result = await compileSketch({ fqbn: 'arduino:avr:uno', sketchDir });
      if (!result.ok && /platform not installed|Unknown FQBN|No such core/iu.test(result.output)) return;
      expect(result.output).toContain('Sketch uses');
      expect(result.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

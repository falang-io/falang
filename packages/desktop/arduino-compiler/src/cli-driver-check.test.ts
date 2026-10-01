/* oxlint-disable no-await-expression-member -- test file */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyCliFailure, createArduinoCliDriverCheck, type ICliCompileOutcome } from './cli-driver-check.js';

const FILES = { 'sketch.ino': 'void setup(){}', 'tiny.h': '// h', 'tiny.cpp': '// c' };
const FQBN = 'arduino:avr:uno';

describe('classifyCliFailure', () => {
  it('turns a missing core into a warning', () => {
    const result = classifyCliFailure('Error: platform not installed', ['sketch.ino'], FQBN);
    expect(result.errors).toBeUndefined();
    expect(result.warnings?.[0]).toContain(FQBN);
  });

  it('turns a header that is not part of the bundle into a warning', () => {
    const result = classifyCliFailure(
      'sketch.ino:1:10: fatal error: Adafruit_Foo.h: No such file or directory',
      ['sketch.ino', 'tiny.h'],
      FQBN,
    );
    expect(result.errors).toBeUndefined();
    expect(result.warnings?.[0]).toContain('Adafruit_Foo.h');
  });

  it('keeps a missing header of the bundle itself as an error', () => {
    const result = classifyCliFailure('fatal error: tiny.h: No such file or directory', ['sketch.ino', 'tiny.h'], FQBN);
    expect(result.warnings).toBeUndefined();
    expect(result.errors).toHaveLength(1);
  });

  it('reports compiler errors as errors', () => {
    const result = classifyCliFailure("tiny.cpp:3:1: error: 'foo' was not declared", ['tiny.cpp'], FQBN);
    expect(result.errors?.[0]).toContain('was not declared');
  });
});

describe('createArduinoCliDriverCheck', () => {
  let tmpRoot = '';
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-check-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns a warning, without compiling, when arduino-cli is missing', async () => {
    const compile = vi.fn<() => Promise<ICliCompileOutcome>>();
    const check = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile,
      isCliAvailable: () => Promise.resolve(false),
      tmpRoot,
    });
    const result = await check(FILES);
    expect(result.warnings).toHaveLength(1);
    expect(compile).not.toHaveBeenCalled();
  });

  it('writes the sketch as sketch/sketch.ino, compiles, and cleans the temp dir up', async () => {
    let seen: string[] = [];
    const compile = vi.fn(async ({ sketchDir }: { sketchDir: string }): Promise<ICliCompileOutcome> => {
      expect(path.basename(sketchDir)).toBe('sketch');
      seen = (await fs.readdir(sketchDir)).toSorted();
      return { ok: true, output: '' };
    });
    const check = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile,
      isCliAvailable: () => Promise.resolve(true),
      tmpRoot,
    });
    expect(await check(FILES)).toEqual({});
    expect(seen).toEqual(['sketch.ino', 'tiny.cpp', 'tiny.h']);
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it('cleans up even when the compile throws', async () => {
    const compile = vi.fn(() => Promise.reject(new Error('boom')));
    const check = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile,
      isCliAvailable: () => Promise.resolve(true),
      tmpRoot,
    });
    await expect(check(FILES)).rejects.toThrow('boom');
    expect(await fs.readdir(tmpRoot)).toEqual([]);
  });

  it('memoizes definitive results by files + fqbn but never warnings', async () => {
    const compile = vi.fn((): Promise<ICliCompileOutcome> => Promise.resolve({ ok: false, output: 'error: nope' }));
    const check = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile,
      isCliAvailable: () => Promise.resolve(true),
      tmpRoot,
    });
    const first = await check(FILES);
    const second = await check(FILES);
    expect(second).toEqual(first);
    expect(compile).toHaveBeenCalledTimes(1);
    await check({ ...FILES, 'tiny.h': '// changed' });
    expect(compile).toHaveBeenCalledTimes(2);

    const warn = vi.fn(
      (): Promise<ICliCompileOutcome> => Promise.resolve({ ok: false, output: 'platform not installed' }),
    );
    const warnCheck = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile: warn,
      isCliAvailable: () => Promise.resolve(true),
      tmpRoot,
    });
    await warnCheck(FILES);
    await warnCheck(FILES);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used entry', async () => {
    const compile = vi.fn((): Promise<ICliCompileOutcome> => Promise.resolve({ ok: true, output: '' }));
    const check = createArduinoCliDriverCheck({
      fqbn: FQBN,
      compile,
      isCliAvailable: () => Promise.resolve(true),
      tmpRoot,
      cacheSize: 2,
    });
    await check({ ...FILES, 'tiny.h': '1' });
    await check({ ...FILES, 'tiny.h': '2' });
    await check({ ...FILES, 'tiny.h': '3' });
    await check({ ...FILES, 'tiny.h': '1' });
    expect(compile).toHaveBeenCalledTimes(4);
  });
});

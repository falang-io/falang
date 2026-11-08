import { describe, expect, it } from 'vitest';
import {
  buildConstantsDeclarations,
  buildConstantsModuleCode,
  coerceConstantValue,
  normalizeConstantsDocumentData,
  readConstants,
  validateConstantName,
  type IWorkflowConstant,
} from './constants-document.js';

const constant = (overrides: Partial<IWorkflowConstant> = {}): IWorkflowConstant => ({
  id: 'c1',
  name: 'API_URL',
  type: 'string',
  dev: 'https://dev.example.com',
  prod: 'https://example.com',
  ...overrides,
});

describe('validateConstantName', () => {
  it.each(['A', 'API_URL', 'MAX_RETRIES_3', 'X_'])('accepts %s', (name) => {
    expect(validateConstantName(name)).toBeNull();
  });

  it.each(['', 'apiUrl', 'Api_URL', '_API', '1API', 'API-URL', 'API URL', 'ПРИВЕТ', 'JSON', 'A'.repeat(65)])(
    'rejects %j',
    (name) => {
      expect(validateConstantName(name)).not.toBeNull();
    },
  );
});

describe('normalizeConstantsDocumentData', () => {
  it('treats null as an empty list', () => {
    expect(normalizeConstantsDocumentData(null)).toEqual({ ok: true, data: { constants: [] } });
  });

  it('keeps valid constants of every type and drops unknown keys', () => {
    const result = normalizeConstantsDocumentData({
      constants: [
        { ...constant(), extra: 1 },
        constant({ id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 2.5 }),
        constant({ id: 'c3', name: 'DEBUG', type: 'boolean', dev: true, prod: false }),
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        constants: [
          constant(),
          constant({ id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 2.5 }),
          constant({ id: 'c3', name: 'DEBUG', type: 'boolean', dev: true, prod: false }),
        ],
      },
    });
  });

  it('reports bad names, duplicates, unknown types and mismatched values', () => {
    const result = normalizeConstantsDocumentData({
      constants: [
        constant({ name: 'apiUrl' }),
        constant(),
        constant({ id: 'c3', name: 'API_URL' }),
        { id: 'c4', name: 'X', type: 'date', dev: '', prod: '' },
        constant({ id: 'c5', name: 'N', type: 'number', dev: '1', prod: Number.NaN }),
        constant({ id: 'c5', name: 'B', type: 'boolean', dev: false, prod: false }),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.stringContaining('"apiUrl" is not a valid constant name'),
      'constants[1]: duplicate id "c1"',
      'constants[2] (API_URL): the name "API_URL" is used twice',
      'constants[3] (X): "type" must be one of string, number, boolean',
      'constants[4] (N): the dev value must be a finite number',
      'constants[4] (N): the prod value must be a finite number',
      'constants[5]: duplicate id "c5"',
    ]);
  });

  it('rejects a non-object', () => {
    expect(normalizeConstantsDocumentData([]).ok).toBe(false);
    expect(readConstants({ constants: 'x' })).toEqual([]);
  });
});

describe('coerceConstantValue', () => {
  it('converts between types', () => {
    expect(coerceConstantValue('string', 42)).toBe('42');
    expect(coerceConstantValue('number', ' 3.5 ')).toBe(3.5);
    expect(coerceConstantValue('number', 'abc')).toBe(0);
    expect(coerceConstantValue('number', true)).toBe(1);
    expect(coerceConstantValue('boolean', 'TRUE')).toBe(true);
    expect(coerceConstantValue('boolean', 0)).toBe(false);
    expect(coerceConstantValue('string', 'kept')).toBe('kept');
  });
});

describe('code generation', () => {
  const constants = [
    constant({ dev: 'a"b\n`${x}`' }),
    constant({ id: 'c2', name: 'LIMIT', type: 'number', dev: -1, prod: 1e3 }),
    constant({ id: 'c3', name: 'DEBUG', type: 'boolean', dev: true, prod: false }),
  ];

  it('declares every constant with its type', () => {
    expect(buildConstantsDeclarations(constants)).toBe(
      'declare const API_URL: string;\ndeclare const LIMIT: number;\ndeclare const DEBUG: boolean;',
    );
  });

  it('writes the values of the requested environment as safe literals', () => {
    expect(buildConstantsModuleCode(constants, 'dev')).toBe(
      'const API_URL: string = "a\\"b\\n`${x}`";\nconst LIMIT: number = -1;\nconst DEBUG: boolean = true;',
    );
    expect(buildConstantsModuleCode(constants, 'prod')).toBe(
      'const API_URL: string = "https://example.com";\nconst LIMIT: number = 1000;\nconst DEBUG: boolean = false;',
    );
  });
});

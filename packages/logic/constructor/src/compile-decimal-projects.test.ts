import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { compileCppProject } from './compile-cpp-project.js';
import { compileGoProject } from './compile-go-project.js';
import { compileRustProject } from './compile-rust-project.js';
import { compileSharpProject } from './compile-sharp-project.js';
import { compileTsProject } from './compile-ts-project.js';

const decimal = (decimals: number): TVariableInfo => ({
  type: 'number',
  numberType: { type: 'decimal', digits: 10, decimals },
});
const int32: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

const functionDocument = (
  id: string,
  name: string,
  body: INode[],
  signature: { parameters?: unknown[]; returnValue?: TVariableInfo } = {},
): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: {
    id: `${id}-root`,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'function-body',
        data: { parameters: signature.parameters ?? [], returnValue: signature.returnValue },
        children: body,
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const createVar = (id: string, name: string, variableType: TVariableInfo, value = ''): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType, value },
});

const DOCS: IProjectDocument[] = [
  {
    id: 'doc-structs',
    type: OBJECTS_STRUCTURE_NAME,
    name: 'Structs',
    root: {
      id: 'doc-structs-root',
      name: OBJECTS_STRUCTURE_NAME,
      children: [
        { id: 'doc-structs-header', name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
        {
          id: 'doc-structs-body',
          name: `${OBJECTS_STRUCTURE_NAME}-body`,
          data: null,
          children: [
            {
              id: 'thread-price',
              name: `${OBJECTS_STRUCTURE_NAME}-thread`,
              data: 'Price',
              children: [
                {
                  id: 'thread-price-0',
                  name: `${OBJECTS_STRUCTURE_NAME}-child`,
                  data: { name: 'amount', variableType: decimal(2) },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  functionDocument('doc-double', 'Double', [{ id: 'r', name: 'return', data: 'x * 2' }], {
    parameters: [{ name: 'x', type: decimal(2) }],
    returnValue: decimal(2),
  }),
  functionDocument('doc-main', 'main', [
    createVar('v1', 'p', decimal(2), '19.99'),
    createVar('v2', 'q', decimal(3)),
    createVar('v3', 'arr', { type: 'array', elementType: decimal(2), dimensions: 1 }),
    { id: 'push', name: 'arr-push', data: { arr: 'arr', value: '1.5' } },
    { id: 'call', name: 'call-function', data: { schemeId: 'doc-double', parameters: ['3'], returnVariable: 'twice' } },
    { id: 'log', name: 'log', data: 'p=${p} q=${q} twice=${twice}' },
  ]),
];

const NO_DECIMAL_DOCS: IProjectDocument[] = [
  functionDocument('doc-main', 'main', [createVar('v1', 'n', int32, '1'), { id: 'log', name: 'log', data: '${n}' }]),
];

describe('projects with decimals (ADR 0069 (private) §4)', () => {
  it('C++: the runtime is inlined once, values are exact, the log prints with the scale', () => {
    const code = compileCppProject({ documents: DOCS, entryDocumentId: 'doc-main' });
    expect(code.match(/struct FalangDecimal /g)).toHaveLength(1);
    expect(code).toContain('struct Price {\n  FalangDecimal<2> amount;\n};');
    expect(code).toContain('FalangDecimal<2> Double(FalangDecimal<2> x)');
    expect(code).toContain('FalangDecimal<2> p = FalangDecimal<2>::fromRaw(1999LL);');
    expect(code).toContain('FalangDecimal<3> q{};');
    expect(code).toContain('arr.push_back(FalangDecimal<2>::fromRaw(150LL));');
    expect(code).toContain('Double(FalangDecimal<2>::fromRaw(300LL))');
    expect(code).toContain('(p).str()');
    expect(code).toContain('return (x * FalangDecimal<2>::fromRaw(200LL));');
  });

  it('Go: an int64 raw value and helper functions, imports only what is used', () => {
    const code = compileGoProject({ documents: DOCS, entryDocumentId: 'doc-main' });
    expect(code).toContain('Amount int64');
    expect(code).toContain('func Double(x int64) int64 {');
    expect(code).toContain('var p int64 = int64(1999);');
    expect(code).toContain('arr = append(arr, int64(150));');
    expect(code).toContain('Double(int64(300))');
    expect(code).toContain('fmt.Sprint(falangDecStr(p, 2))');
    expect(code).toContain('func falangDecMul(');
    expect(code).toContain('return falangDecMul(x, int64(200), 2);');
  });

  it('Rust: a module of its own, declared in mod.rs and imported where used', () => {
    const { files } = compileRustProject({ documents: DOCS, entryDocumentId: 'doc-main' });
    expect(files['falang_decimal.rs']).toContain('pub struct FalangDecimal<const S: u32>');
    expect(files['mod.rs']).toContain('pub mod falang_decimal;');
    expect(files['main.rs']).toContain('use crate::falang::falang_decimal::FalangDecimal;');
    expect(files['main.rs']).toContain('let mut p: FalangDecimal<2> = FalangDecimal::<2>::from_raw(1999);');
    expect(files['main.rs']).toContain('let mut q: FalangDecimal<3> = Default::default();');
    expect(files['Structs.rs']).toContain('pub amount: FalangDecimal<2>');
    expect(files['Structs.rs']).toContain('use crate::falang::falang_decimal::FalangDecimal;');
    expect(files['falang_decimal.rs']).not.toContain('use crate::falang::falang_decimal');
  });

  it('C#: the native decimal, with a rounding helper class', () => {
    const code = compileSharpProject({ documents: DOCS, entryDocumentId: 'doc-main' });
    expect(code).toContain('public static class FalangDec {');
    expect(code).toContain('public decimal amount');
    expect(code).toContain('decimal p = (decimal)(19.99m)');
    expect(code).toContain('arr.Add(1.50m);');
    expect(code).toContain('FalangDec.Str(p, 2)');
  });

  it('TS: plain numbers, one runtime file, imports of the helpers each file calls', () => {
    const { files } = compileTsProject({ documents: DOCS });
    expect(files['_falang_decimal.ts']).toContain('export function falangDecMul');
    expect(files['Double.ts']).toContain("import { falangDecMul } from './_falang_decimal';");
    expect(files['Double.ts']).toContain('return falangDecMul(x, 2, 2);');
    expect(files['main.ts']).toContain("import { falangDecStr } from './_falang_decimal';");
    expect(files['main.ts']).toContain('let p: number = 19.99;');
    expect(files['main.ts']).toContain('falangDecStr(p, 2)');
  });

  it('emits no decimal runtime when a project has no decimals', () => {
    expect(compileCppProject({ documents: NO_DECIMAL_DOCS })).not.toContain('FalangDec');
    expect(compileGoProject({ documents: NO_DECIMAL_DOCS })).not.toContain('falangDec');
    expect(compileSharpProject({ documents: NO_DECIMAL_DOCS })).not.toContain('FalangDec');
    expect(Object.keys(compileRustProject({ documents: NO_DECIMAL_DOCS }).files)).not.toContain('falang_decimal.rs');
    expect(Object.keys(compileTsProject({ documents: NO_DECIMAL_DOCS }).files)).not.toContain('_falang_decimal.ts');
  });
});

import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsProject, TsProjectCompileError } from './compile-ts-project.js';
import {
  externalApiDocument,
  functionDocument,
  functionNode,
  structDocument,
} from './compile-ts-project.test-fixtures.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

describe('compileTsProject', () => {
  it('compiles one .ts file per function document, with I<Name>Params/async function and a FalangGlobal import', () => {
    const main = functionNode({
      id: 'doc-main',
      parameters: [{ name: 'n', type: numberType }],
      returnValue: numberType,
      body: [{ id: 'r', name: 'return', data: 'n + 1' }],
    });
    const { files } = compileTsProject({ documents: [functionDocument('doc-main', 'increment', main)] });

    expect(Object.keys(files).toSorted()).toEqual(['_falang.ts', 'increment.ts']);
    expect(files['_falang.ts']).toBe('export interface FalangGlobal {\n}');
    expect(files['increment.ts']).toContain("import { FalangGlobal } from './_falang';");
    expect(files['increment.ts']).toContain(
      'export interface IincrementParams {\n  n: number;\n  _falangGlobal: FalangGlobal;\n}',
    );
    expect(files['increment.ts']).toContain(
      'export async function increment(_params: IincrementParams): Promise<number> {',
    );
    expect(files['increment.ts']).toContain('return n + 1;');
  });

  it("declares an auto-managed returnValue local, initialized to the type's empty value, and returns it at the end — the old app's own convention (ADR 0019 (private))", () => {
    const struct = structDocument('doc-point', 'Point', [
      { threadId: 'point', name: 'Point', properties: { x: numberType, y: numberType } },
    ]);
    const structType = { type: 'struct', id: 'point' };
    const fn = functionNode({
      id: 'doc-fn',
      returnValue: structType,
      body: [
        { id: 'a1', name: 'action', data: 'returnValue.x = 1' },
        { id: 'a2', name: 'action', data: 'returnValue.y = 2' },
      ],
    });
    const { files } = compileTsProject({ documents: [struct, functionDocument('doc-fn', 'origin', fn)] });

    expect(files['origin.ts']).toContain("import { Point } from './Point';");
    expect(files['origin.ts']).toContain('let returnValue: Point = {x:0,y:0};');
    expect(files['origin.ts']).toContain('returnValue.x = 1;');
    expect(files['origin.ts']).toContain('returnValue.y = 2;');
    expect(files['origin.ts']).toContain('return returnValue;');
  });

  it('an explicit return node mid-body coexists with the trailing auto-return (isGameOver-shaped function)', () => {
    const fn = functionNode({
      id: 'doc-fn',
      parameters: [{ name: 'x', type: { type: 'boolean' } }],
      returnValue: { type: 'boolean' },
      body: [
        {
          id: 'if1',
          name: 'if',
          data: 'x',
          children: [
            { id: 'then', name: 'if-child', children: [], out: { id: 'r1', name: 'return', data: 'true' } },
            { id: 'else', name: 'if-child', children: [] },
          ],
        },
      ],
    });
    const { files } = compileTsProject({ documents: [functionDocument('doc-fn', 'check', fn)] });
    expect(files['check.ts']).toContain('return true;');
    expect(files['check.ts']).toContain('let returnValue: boolean = false;');
    expect(files['check.ts'].trim().endsWith('return returnValue;\n}')).toBe(true);
  });

  it('emits one struct-declarations file per objects-structure document, importing a cross-document struct field type', () => {
    const inner = structDocument('doc-inner', 'Inner', [
      { threadId: 'point', name: 'Point', properties: { x: numberType } },
    ]);
    const outer = structDocument('doc-outer', 'Outer', [
      { threadId: 'box', name: 'Box', properties: { corner: { type: 'struct', id: 'point' } } },
    ]);
    const { files } = compileTsProject({ documents: [inner, outer] });

    expect(files['Inner.ts']).toBe('export interface Point {\n  x: number;\n}');
    expect(files['Outer.ts']).toContain("import { Point } from './Inner';");
    expect(files['Outer.ts']).toContain('export interface Box {\n  corner: Point;\n}');
  });

  it('emits one API-declarations file per external-api-structure document, nesting groups under the doc interface', () => {
    const api = externalApiDocument('doc-api', 'GameApi', [
      {
        groupId: 'group-app',
        name: 'Application',
        endpoints: [{ id: 'ep-sleep', name: 'Sleep', parameters: [], returnValue: { type: 'void' } }],
      },
      {
        groupId: 'group-draw',
        name: 'Drawing',
        endpoints: [
          {
            id: 'ep-rect',
            name: 'DrawRect',
            parameters: [{ name: 'x', type: numberType }],
            returnValue: { type: 'void' },
          },
        ],
      },
    ]);
    const { files } = compileTsProject({ documents: [api] });

    expect(files['GameApi.ts']).toContain('export interface ISleepParams {\n}');
    expect(files['GameApi.ts']).toContain(
      'export interface Application {\n  Sleep(params: ISleepParams): Promise<void>;\n}',
    );
    expect(files['GameApi.ts']).toContain('export interface IDrawRectParams {\n  x: number;\n}');
    expect(files['GameApi.ts']).toContain(
      'export interface Drawing {\n  DrawRect(params: IDrawRectParams): Promise<void>;\n}',
    );
    expect(files['GameApi.ts']).toContain(
      'export interface GameApi {\n  Application: Application;\n  Drawing: Drawing;\n}',
    );
  });

  it('builds _falang.ts with an Apis interface importing every external-api-structure document', () => {
    const api = externalApiDocument('doc-api', 'GameApi', [{ groupId: 'g', name: 'Application', endpoints: [] }]);
    const { files } = compileTsProject({ documents: [api] });

    expect(files['_falang.ts']).toBe(
      [
        "import { GameApi } from './GameApi';",
        'export interface Apis {\n  GameApi: GameApi;\n}',
        'export interface FalangGlobal {\n  apis: Apis;\n}',
      ].join('\n\n'),
    );
  });

  it('resolves call-function across documents to a single keyed-object call and imports the callee', () => {
    const callee = functionNode({
      id: 'doc-callee',
      parameters: [{ name: 'n', type: numberType }],
      returnValue: numberType,
      body: [{ id: 'r', name: 'return', data: 'n + 1' }],
    });
    const caller = functionNode({
      id: 'doc-caller',
      body: [
        {
          id: 'c',
          name: 'call-function',
          data: { schemeId: 'doc-callee', parameters: ['5'], returnVariable: 'result' },
        },
        { id: 'l', name: 'log', data: 'result: ${result}' },
      ],
    });
    const { files } = compileTsProject({
      documents: [functionDocument('doc-callee', 'increment', callee), functionDocument('doc-caller', 'main', caller)],
    });

    expect(files['main.ts']).toContain("import { increment } from './increment';");
    expect(files['main.ts']).toContain('let result: number = await increment({ n: 5, _falangGlobal });');
  });

  it('resolves call-api to the three-level _falangGlobal.apis.<ApiDoc>.<Group>.<Endpoint> path', () => {
    const api = externalApiDocument('doc-api', 'GameApi', [
      {
        groupId: 'g',
        name: 'Application',
        endpoints: [{ id: 'ep-1', name: 'Sleep', parameters: [], returnValue: { type: 'void' } }],
      },
    ]);
    const caller = functionNode({
      id: 'doc-main',
      body: [{ id: 'c', name: 'call-api', data: { iconId: 'ep-1', parameters: [], returnVariable: '' } }],
    });
    const { files } = compileTsProject({ documents: [api, functionDocument('doc-main', 'main', caller)] });

    expect(files['main.ts']).toContain('await _falangGlobal.apis.GameApi.Application.Sleep({ });');
  });

  it("collects a per-document compile error without losing the other documents' compiled files", () => {
    const broken = functionNode({
      id: 'doc-broken',
      body: [{ id: 'a', name: 'unknown-node-kind' } as unknown as INode],
    });
    const fine = functionNode({ id: 'doc-fine', body: [{ id: 'l', name: 'log', data: 'ok' }] });
    const documents = [functionDocument('doc-broken', 'broken', broken), functionDocument('doc-fine', 'fine', fine)];

    const caught: unknown = ((): unknown => {
      try {
        compileTsProject({ documents });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(TsProjectCompileError);
    const compileError = caught as TsProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-broken');
    expect(compileError.partialFiles.files['fine.ts']).toContain('export async function fine(');
    expect(compileError.partialFiles.files['broken.ts']).toBeUndefined();
  });

  it('deep-copies struct/array parameters on entry, but not scalar ones', () => {
    const struct = structDocument('doc-point', 'Point', [
      { threadId: 'point', name: 'Point', properties: { x: numberType } },
    ]);
    const structType = { type: 'struct', id: 'point' };
    const arrayType = { type: 'array', elementType: numberType, dimensions: 1 };
    const fn = functionNode({
      id: 'doc-fn',
      parameters: [
        { name: 'p', type: structType },
        { name: 'items', type: arrayType },
        { name: 'n', type: numberType },
      ],
      body: [],
    });
    const { files } = compileTsProject({ documents: [struct, functionDocument('doc-fn', 'run', fn)] });

    expect(files['run.ts']).toContain('let p: Point = JSON.parse(JSON.stringify(_params.p));');
    expect(files['run.ts']).toContain('let items: number[] = JSON.parse(JSON.stringify(_params.items));');
    expect(files['run.ts']).toContain('let n: number = _params.n;');
  });
});

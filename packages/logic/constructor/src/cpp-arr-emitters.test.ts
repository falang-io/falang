import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileCppStatements, type ICppCompileParams } from './compile-cpp-statements.js';
import { cppAdapter } from './languages/cpp-adapter.js';
const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };
const pointType: TVariableInfo = { type: 'struct', id: 'S1' };
const arrayOfPoint: TVariableInfo = { type: 'array', elementType: pointType, dimensions: 1 };

const params: ICppCompileParams = {
  structNames: new Map([['S1', 'Point']]),
  structDefinitions: new Map([['S1', { name: 'Point', properties: { x: int32Type } }]]),
  functionSignatures: new Map([['voidFn', { cppName: 'voidFn' }]]),
  apiEndpoints: new Map(),
  adapter: cppAdapter,
};

const compile = (nodes: readonly INode[], scope: Record<string, TVariableInfo>): string =>
  compileCppStatements(nodes, scope, params);

const node = (name: string, data: unknown): INode => ({ id: 'n', name, data });
const scope = { nums: arrayOfInt32, other: arrayOfInt32, pts: arrayOfPoint, p: pointType, i: int32Type };

describe('cpp arr-* emitters', () => {
  it('compiles every array statement kind, scalar and struct elements', () => {
    const cases: [string, INode][] = [
      ['arr-push scalar', node('arr-push', { arr: 'nums', value: 'i' })],
      ['arr-push struct', node('arr-push', { arr: 'pts', value: 'p' })],
      ['arr-unshift scalar', node('arr-unshift', { arr: 'nums', value: 'i' })],
      ['arr-unshift struct', node('arr-unshift', { arr: 'pts', value: 'p' })],
      ['arr-insert scalar', node('arr-insert', { arr: 'nums', start: '1', insertArr: 'other' })],
      ['arr-insert struct array', node('arr-insert', { arr: 'pts', start: 'i', insertArr: 'pts' })],
      ['arr-pop without variable', node('arr-pop', { arr: 'nums', variable: '' })],
      ['arr-pop scalar', node('arr-pop', { arr: 'nums', variable: 'v' })],
      ['arr-pop struct', node('arr-pop', { arr: 'pts', variable: 'v' })],
      ['arr-shift without variable', node('arr-shift', { arr: 'nums', variable: '' })],
      ['arr-shift struct', node('arr-shift', { arr: 'pts', variable: 'v' })],
      ['arr-slice scalar', node('arr-slice', { arr: 'nums', variable: 's', start: '0', end: '2' })],
      ['arr-slice discarded', node('arr-slice', { arr: 'nums', variable: '', start: '0', end: '2' })],
    ];
    const out = Object.fromEntries(cases.map(([label, statement]) => [label, compile([statement], scope)]));
    expect(out).toMatchInlineSnapshot(`
      {
        "arr-insert scalar": "// icon-start:arr-insert:n
      nums.insert(nums.begin() + (1), other.begin(), other.end());
      // icon-end:arr-insert:n",
        "arr-insert struct array": "// icon-start:arr-insert:n
      pts.insert(pts.begin() + (i), pts.begin(), pts.end());
      // icon-end:arr-insert:n",
        "arr-pop scalar": "// icon-start:arr-pop:n
      int v = nums.back();
      nums.pop_back();
      // icon-end:arr-pop:n",
        "arr-pop struct": "// icon-start:arr-pop:n
      Point v = pts.back();
      pts.pop_back();
      // icon-end:arr-pop:n",
        "arr-pop without variable": "// icon-start:arr-pop:n
      nums.pop_back();
      // icon-end:arr-pop:n",
        "arr-push scalar": "// icon-start:arr-push:n
      nums.push_back(i);
      // icon-end:arr-push:n",
        "arr-push struct": "// icon-start:arr-push:n
      pts.push_back(p);
      // icon-end:arr-push:n",
        "arr-shift struct": "// icon-start:arr-shift:n
      Point v = pts.front();
      pts.erase(pts.begin());
      // icon-end:arr-shift:n",
        "arr-shift without variable": "// icon-start:arr-shift:n
      nums.erase(nums.begin());
      // icon-end:arr-shift:n",
        "arr-slice discarded": "// icon-start:arr-slice:n
      (void)std::vector<int>(nums.begin() + (0), nums.begin() + (2));
      // icon-end:arr-slice:n",
        "arr-slice scalar": "// icon-start:arr-slice:n
      std::vector<int> s = std::vector<int>(nums.begin() + (0), nums.begin() + (2));
      // icon-end:arr-slice:n",
        "arr-unshift scalar": "// icon-start:arr-unshift:n
      nums.insert(nums.begin(), i);
      // icon-end:arr-unshift:n",
        "arr-unshift struct": "// icon-start:arr-unshift:n
      pts.insert(pts.begin(), p);
      // icon-end:arr-unshift:n",
      }
    `);
  });

  it('threads the popped variable into the scope of later statements', () => {
    const code = compile(
      [node('arr-pop', { arr: 'pts', variable: 'v' }), { id: 'l', name: 'log', data: 'x: ${v.x}' }],
      scope,
    );
    expect(code).toMatchInlineSnapshot(`
      "// icon-start:arr-pop:n
      Point v = pts.back();
      pts.pop_back();
      // icon-end:arr-pop:n
      // icon-start:log:l
      std::cout << "x: " << v.x << std::endl;
      // icon-end:log:l"
    `);
  });

  it.each([['arr-pop'], ['arr-shift']])('%s with a variable needs an array-typed identifier in scope', (name) => {
    expect(() => compile([node(name, { arr: 'i', variable: 'v' })], scope)).toThrow(/array/);
  });

  it('rejects call-function to an unknown document and a returnVariable on a void callee', () => {
    expect(() =>
      compile([node('call-function', { schemeId: 'nope', parameters: [], returnVariable: '' })], scope),
    ).toThrow(/unknown document/);
    expect(() =>
      compile([node('call-function', { schemeId: 'voidFn', parameters: [], returnVariable: 'r' })], scope),
    ).toThrow(/returns void/);
  });

  it('rejects call-api to an unknown endpoint', () => {
    expect(() => compile([node('call-api', { iconId: 'nope', parameters: [], returnVariable: '' })], scope)).toThrow(
      /unknown endpoint/,
    );
  });
});

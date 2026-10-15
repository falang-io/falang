import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileGoStatements, type IGoCompileParams } from './compile-go-statements.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };
const pointType: TVariableInfo = { type: 'struct', id: 'S1' };
const arrayOfPoint: TVariableInfo = { type: 'array', elementType: pointType, dimensions: 1 };

const params: IGoCompileParams = {
  structNames: new Map([['S1', 'Point']]),
  structDefinitions: new Map([['S1', { name: 'Point', properties: { x: int32Type } }]]),
  functionSignatures: new Map([['voidFn', { goName: 'voidFn' }]]),
  apiEndpoints: new Map(),
};

const compile = (nodes: readonly INode[], scope: Record<string, TVariableInfo>): string =>
  compileGoStatements(nodes, scope, params);

const node = (name: string, data: unknown): INode => ({ id: 'n', name, data });
const scope = { nums: arrayOfInt32, other: arrayOfInt32, pts: arrayOfPoint, p: pointType, i: int32Type };

describe('go arr-* emitters', () => {
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
      nums = append(nums[:1:1], append(other, nums[1:]...)...);
      // icon-end:arr-insert:n",
        "arr-insert struct array": "// icon-start:arr-insert:n
      pts = append(pts[:i:i], append(pts, pts[i:]...)...);
      // icon-end:arr-insert:n",
        "arr-pop scalar": "// icon-start:arr-pop:n
      var v int32 = nums[len(nums)-1];
      nums = nums[:len(nums)-1];
      // icon-end:arr-pop:n",
        "arr-pop struct": "// icon-start:arr-pop:n
      var v Point = pts[len(pts)-1];
      pts = pts[:len(pts)-1];
      // icon-end:arr-pop:n",
        "arr-pop without variable": "// icon-start:arr-pop:n
      nums = nums[:len(nums)-1];
      // icon-end:arr-pop:n",
        "arr-push scalar": "// icon-start:arr-push:n
      nums = append(nums, i);
      // icon-end:arr-push:n",
        "arr-push struct": "// icon-start:arr-push:n
      pts = append(pts, p);
      // icon-end:arr-push:n",
        "arr-shift struct": "// icon-start:arr-shift:n
      var v Point = pts[0];
      pts = pts[1:];
      // icon-end:arr-shift:n",
        "arr-shift without variable": "// icon-start:arr-shift:n
      nums = nums[1:];
      // icon-end:arr-shift:n",
        "arr-slice discarded": "// icon-start:arr-slice:n
      _ = nums[0:2];
      // icon-end:arr-slice:n",
        "arr-slice scalar": "// icon-start:arr-slice:n
      var s []int32 = nums[0:2];
      // icon-end:arr-slice:n",
        "arr-unshift scalar": "// icon-start:arr-unshift:n
      nums = append([]int32{i}, nums...);
      // icon-end:arr-unshift:n",
        "arr-unshift struct": "// icon-start:arr-unshift:n
      pts = append([]Point{p}, pts...);
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
      var v Point = pts[len(pts)-1];
      pts = pts[:len(pts)-1];
      // icon-end:arr-pop:n
      // icon-start:log:l
      fmt.Println("x: " + fmt.Sprint(v.X));
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

describe('go arr-insert aliasing', () => {
  // `append(insertArr, arr[start:]...)` appends into insertArr's own backing array when it has spare
  // capacity, so a caller's other slice sharing that array can observe the write. Only the left half is
  // capped with a three-index slice. Needs a decision (copy insertArr first) and a compile-and-run test.
  it.todo('does not write into the spare capacity of insertArr');
});

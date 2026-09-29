import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

describe('compileStatements: array ops and call-function', () => {
  it('compiles arr-pop/arr-shift into a const assignment from .pop()/.shift()', () => {
    expect(compileStatements([{ id: 'p', name: 'arr-pop', data: { arr: 'items', variable: 'last' } }])).toBe(
      '// icon-start:arr-pop:p\nconst last = items.pop();\n// icon-end:arr-pop:p',
    );
    expect(compileStatements([{ id: 's', name: 'arr-shift', data: { arr: 'items', variable: 'first' } }])).toBe(
      '// icon-start:arr-shift:s\nconst first = items.shift();\n// icon-end:arr-shift:s',
    );
  });

  it('compiles arr-push/arr-unshift into a method call statement', () => {
    expect(compileStatements([{ id: 'p', name: 'arr-push', data: { arr: 'items', value: '42' } }])).toBe(
      '// icon-start:arr-push:p\nitems.push(42);\n// icon-end:arr-push:p',
    );
    expect(compileStatements([{ id: 'u', name: 'arr-unshift', data: { arr: 'items', value: '42' } }])).toBe(
      '// icon-start:arr-unshift:u\nitems.unshift(42);\n// icon-end:arr-unshift:u',
    );
  });

  it('compiles arr-insert into a splice call spreading the inserted array', () => {
    const node: INode = { id: 'i', name: 'arr-insert', data: { arr: 'items', start: '1', insertArr: 'extras' } };
    expect(compileStatements([node])).toBe(
      '// icon-start:arr-insert:i\nitems.splice(1, 0, ...extras);\n// icon-end:arr-insert:i',
    );
  });

  it('compiles arr-slice into a const assignment from .slice()', () => {
    const node: INode = { id: 's', name: 'arr-slice', data: { arr: 'items', variable: 'part', start: '0', end: '2' } };
    expect(compileStatements([node])).toBe(
      '// icon-start:arr-slice:s\nconst part = items.slice(0, 2);\n// icon-end:arr-slice:s',
    );
  });

  it('compiles call-function into an awaited call, assigned when returnVariable is set', () => {
    const node: INode = {
      id: 'c1',
      name: 'call-function',
      data: { schemeId: 'scheme-2', parameters: ['orderId', '"eu"'], returnVariable: 'result' },
    };
    expect(compileStatements([node], () => 'processOrder')).toBe(
      '// icon-start:call-function:c1\nconst result = await processOrder(orderId, "eu");\n// icon-end:call-function:c1',
    );
  });

  it('compiles call-function without an assignment when returnVariable is empty', () => {
    const node: INode = {
      id: 'c1',
      name: 'call-function',
      data: { schemeId: 'scheme-2', parameters: [], returnVariable: '' },
    };
    expect(compileStatements([node], () => 'sendEmail')).toBe(
      '// icon-start:call-function:c1\nawait sendEmail();\n// icon-end:call-function:c1',
    );
  });

  it('passes call-function.schemeId to resolveFunctionName', () => {
    const node: INode = {
      id: 'c1',
      name: 'call-function',
      data: { schemeId: 'scheme-42', parameters: [], returnVariable: '' },
    };
    expect(compileStatements([node], (schemeId) => `fn_${schemeId}`)).toBe(
      '// icon-start:call-function:c1\nawait fn_scheme-42();\n// icon-end:call-function:c1',
    );
  });
});

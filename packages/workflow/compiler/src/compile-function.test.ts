import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileFunction, getFunctionSignature } from './compile-function.js';

describe('compileFunction', () => {
  it('compiles a full function: header, create-var, action, if/else, footer', () => {
    const functionNode: INode = {
      id: 'fn1',
      name: 'function',
      children: [
        { id: 'header', name: 'function-header', data: '' },
        {
          id: 'body',
          name: 'function-body',
          data: {
            parameters: [{ name: 'orderId', type: { type: 'string' } }],
            returnValue: { type: 'boolean' },
          },
          children: [
            { id: 'v1', name: 'create-var', data: { name: 'isValid', variableType: { type: 'boolean' } } },
            { id: 'a1', name: 'action', data: 'isValid = orderId.length > 0' },
            {
              id: 'if1',
              name: 'if',
              data: 'isValid',
              children: [
                { id: 'then', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'orderId' }] },
                { id: 'else', name: 'if-child', children: [{ id: 'l2', name: 'log', data: 'invalid order' }] },
              ],
            },
            { id: 'a2', name: 'action', data: 'return isValid' },
          ],
        },
        { id: 'footer', name: 'function-footer', data: '' },
      ],
    };

    expect(compileFunction(functionNode, 'processOrder')).toBe(
      [
        'export async function processOrder(orderId: string): Promise<boolean> {',
        '  // icon-start:create-var:v1',
        '  let isValid: boolean = false;',
        '  // icon-end:create-var:v1',
        '  // icon-start:action:a1',
        '  isValid = orderId.length > 0;',
        '  // icon-end:action:a1',
        '  // icon-start:if:if1',
        '  if (isValid) {',
        '    // icon-start:log:l1',
        '    await logActivity(`orderId`);',
        '    // icon-end:log:l1',
        '  } else {',
        '    // icon-start:log:l2',
        '    await logActivity(`invalid order`);',
        '    // icon-end:log:l2',
        '  }',
        '  // icon-end:if:if1',
        '  // icon-start:action:a2',
        '  return isValid;',
        '  // icon-end:action:a2',
        '}',
      ].join('\n'),
    );
  });

  it('defaults the return type to void and omits parameters when none are declared', () => {
    const functionNode: INode = {
      id: 'fn1',
      name: 'function',
      children: [
        { id: 'header', name: 'function-header', data: '' },
        {
          id: 'body',
          name: 'function-body',
          data: { parameters: [] },
          children: [{ id: 'l1', name: 'log', data: 'working' }],
        },
        { id: 'footer', name: 'function-footer', data: '' },
      ],
    };

    expect(compileFunction(functionNode, 'doWork')).toBe(
      [
        'export async function doWork(): Promise<void> {',
        '  // icon-start:log:l1',
        '  await logActivity(`working`);',
        '  // icon-end:log:l1',
        '}',
      ].join('\n'),
    );
  });

  it('compiles a non-empty header as a JSDoc comment above the declaration, and footer as raw code inside the body', () => {
    const functionNode: INode = {
      id: 'fn1',
      name: 'function',
      children: [
        { id: 'header', name: 'function-header', data: 'Runs the order workflow.' },
        { id: 'body', name: 'function-body', data: { parameters: [] }, children: [] },
        { id: 'footer', name: 'function-footer', data: 'console.log(Date.now())' },
      ],
    };

    expect(compileFunction(functionNode, 'run')).toBe(
      [
        '/**',
        ' * Runs the order workflow.',
        ' */',
        'export async function run(): Promise<void> {',
        '  console.log(Date.now());',
        '}',
      ].join('\n'),
    );
  });

  it('throws when the function-body child is missing', () => {
    const functionNode: INode = { id: 'fn1', name: 'function', children: [] };
    expect(() => compileFunction(functionNode, 'run')).toThrow(/function-body/);
  });
});

describe('getFunctionSignature', () => {
  it('reads parameters and return type without compiling the body', () => {
    const functionNode: INode = {
      id: 'fn1',
      name: 'function',
      children: [
        { id: 'header', name: 'function-header', data: '' },
        {
          id: 'body',
          name: 'function-body',
          data: {
            parameters: [{ name: 'orderId', type: { type: 'string' } }],
            returnValue: { type: 'boolean' },
          },
          children: [{ id: 'a1', name: 'action', data: 'return orderId.length > 0' }],
        },
        { id: 'footer', name: 'function-footer', data: '' },
      ],
    };

    expect(getFunctionSignature(functionNode)).toEqual({
      parameters: [{ name: 'orderId', type: { type: 'string' } }],
      returnValue: { type: 'boolean' },
    });
  });

  it('omits returnValue when none is declared', () => {
    const functionNode: INode = {
      id: 'fn1',
      name: 'function',
      children: [
        { id: 'header', name: 'function-header', data: '' },
        { id: 'body', name: 'function-body', data: { parameters: [] }, children: [] },
        { id: 'footer', name: 'function-footer', data: '' },
      ],
    };

    expect(getFunctionSignature(functionNode)).toEqual({ parameters: [] });
  });

  it('throws when the function-body child is missing', () => {
    const functionNode: INode = { id: 'fn1', name: 'function', children: [] };
    expect(() => getFunctionSignature(functionNode)).toThrow(/function-body/);
  });
});

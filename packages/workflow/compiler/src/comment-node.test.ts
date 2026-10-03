import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileFunction } from './compile-function.js';
import { emitComment } from './leaf-emitters.js';

const comment = (data: unknown): INode => ({ id: 'c1', name: 'comment', data });

describe('emitComment', () => {
  it('turns every line into a // comment, so */ in the text is harmless', () => {
    expect(emitComment(comment('Why: */ the API needs it\n\n  twice  '))).toBe(
      '// Why: */ the API needs it\n//\n//   twice',
    );
  });

  it('emits nothing for an empty comment', () => {
    expect(emitComment(comment('   '))).toBe('');
    expect(emitComment(comment(null))).toBe('');
  });
});

describe('compileFunction with a comment node', () => {
  it('keeps the comment in the body without any code', () => {
    const source = compileFunction(
      {
        id: 'fn',
        name: 'function',
        children: [
          { id: 'header', name: 'function-header', data: '' },
          {
            id: 'body',
            name: 'function-body',
            data: { parameters: [] },
            children: [comment('Explain the next step'), { id: 'a1', name: 'action', data: 'const x = 1' }],
          },
          { id: 'footer', name: 'function-footer', data: '' },
        ],
      },
      'withComment',
    );
    expect(source).toContain('// Explain the next step');
    expect(source).toContain('const x = 1;');
  });
});
